import type { Grant, ResetInterval } from "../catalog/feature.ts"
import type { Plan } from "../catalog/plan.ts"
import type { Queryable } from "../database/database.ts"
import type { Customer } from "../entities/customer.ts"
import { isGranting, type Subscription } from "../entities/subscription.ts"
import { createId } from "../lib/id.ts"
import { currentWindow } from "../lib/period.ts"
import { recordFrom } from "../lib/record.ts"
import type { Context } from "./context.ts"
import { getOrCreateCustomer } from "./customers.ts"
import { DunasError } from "./errors.ts"
import { listSubscriptions } from "./subscriptions.ts"

export type Balance = {
  limit: number | "unlimited"
  used: number
  remaining: number | "unlimited"
  resetsAt: Date | null
}

type MeteredEntitlement = {
  limit: number | "unlimited"
  reset: ResetInterval
}

type UsageRow = {
  featureId: string
  used: number
  windowStart: Date
}

type UsageInput = {
  customerId: string
  featureId: string
  amount?: number
  idempotencyKey?: string
}

export async function getEntitlements<TMeteredId extends string, TBooleanId extends string>(
  context: Context,
  customer: Customer,
  subscriptions: Subscription[],
  {
    meteredIds,
    booleanIds,
  }: { meteredIds: readonly TMeteredId[]; booleanIds: readonly TBooleanId[] },
) {
  const grants = grantsOf(context, subscriptions)
  const usage = await context.database.query<UsageRow>(
    `SELECT feature_id AS "featureId", used::float8 AS used, window_start AS "windowStart"
     FROM dunas_usage WHERE customer_id = $1`,
    [customer.id],
  )

  return {
    balances: recordFrom(meteredIds, (featureId) =>
      balanceOf(context, { customer, grants, usage, featureId }),
    ),
    flags: recordFrom(booleanIds, (featureId) =>
      grants.some((grant) => grant.featureId === featureId),
    ),
  }
}

export async function check(
  context: Context,
  {
    customerId,
    featureId,
    required = 1,
  }: { customerId: string; featureId: string; required?: number },
) {
  const customer = await getOrCreateCustomer(context, customerId)
  const grants = grantsOf(context, await listSubscriptions(context, customerId))

  if (!isMeteredFeature(context, featureId)) {
    return { allowed: grants.some((grant) => grant.featureId === featureId) }
  }

  const usage = await context.database.query<UsageRow>(
    `SELECT feature_id AS "featureId", used::float8 AS used, window_start AS "windowStart"
     FROM dunas_usage WHERE customer_id = $1 AND feature_id = $2`,
    [customerId, featureId],
  )
  const balance = balanceOf(context, { customer, grants, usage, featureId })
  const allowed = balance.remaining === "unlimited" || balance.remaining >= required
  return { allowed, balance }
}

export async function track(context: Context, input: UsageInput) {
  const { balance } = await recordUsage(context, input, { enforceLimit: false })
  return { balance }
}

export async function consume(context: Context, input: UsageInput) {
  return recordUsage(context, input, { enforceLimit: true })
}

async function recordUsage(
  context: Context,
  { customerId, featureId, amount = 1, idempotencyKey }: UsageInput,
  { enforceLimit }: { enforceLimit: boolean },
) {
  if (!isMeteredFeature(context, featureId)) {
    throw new DunasError(
      "FEATURE_NOT_METERED",
      `Feature "${featureId}" is not a metered feature in your plans`,
    )
  }

  const customer = await getOrCreateCustomer(context, customerId)
  const grants = grantsOf(context, await listSubscriptions(context, customerId))
  const { limit, reset } = meteredEntitlement(context, grants, featureId)
  const window = currentWindow(customer.usageAnchorAt, reset, context.now())
  const maxUsed = enforceLimit && limit !== "unlimited" ? limit : Number.MAX_SAFE_INTEGER

  const used = await context.database.transaction(async (tx) => {
    const eventId = await insertUsageEvent(tx, { customerId, featureId, amount, idempotencyKey })
    if (!eventId) {
      return { applied: true, used: await currentUsage(tx, customerId, featureId, window.start) }
    }

    const [row] = await tx.query<{ used: number }>(
      `INSERT INTO dunas_usage (customer_id, feature_id, used, window_start)
       SELECT $1, $2, GREATEST($3::bigint, 0), $4 WHERE GREATEST($3::bigint, 0) <= $5::bigint
       ON CONFLICT (customer_id, feature_id) DO UPDATE SET
         used = GREATEST(CASE WHEN dunas_usage.window_start = EXCLUDED.window_start THEN dunas_usage.used ELSE 0 END + $3::bigint, 0),
         window_start = EXCLUDED.window_start,
         updated_at = now()
       WHERE GREATEST(CASE WHEN dunas_usage.window_start = EXCLUDED.window_start THEN dunas_usage.used ELSE 0 END + $3::bigint, 0) <= $5::bigint
       RETURNING used::float8 AS used`,
      [customerId, featureId, amount, window.start, maxUsed],
    )

    if (!row) {
      await tx.query("DELETE FROM dunas_usage_event WHERE id = $1", [eventId])
      return { applied: false, used: await currentUsage(tx, customerId, featureId, window.start) }
    }

    return { applied: true, used: row.used }
  })

  return {
    allowed: used.applied,
    balance: toBalance({ limit, reset }, used.used, window.end),
  }
}

async function insertUsageEvent(
  tx: Queryable,
  {
    customerId,
    featureId,
    amount,
    idempotencyKey,
  }: { customerId: string; featureId: string; amount: number; idempotencyKey: string | undefined },
) {
  const inserted = await tx.query<{ id: string }>(
    `INSERT INTO dunas_usage_event (id, customer_id, feature_id, amount, idempotency_key)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    [createId("use"), customerId, featureId, amount, idempotencyKey ?? null],
  )
  return inserted[0]?.id ?? null
}

async function currentUsage(
  tx: Queryable,
  customerId: string,
  featureId: string,
  windowStart: Date,
) {
  const [row] = await tx.query<{ used: number }>(
    `SELECT used::float8 AS used FROM dunas_usage
     WHERE customer_id = $1 AND feature_id = $2 AND window_start = $3`,
    [customerId, featureId, windowStart],
  )
  return row?.used ?? 0
}

export function grantingPlans(context: Context, subscriptions: Subscription[]): readonly Plan[] {
  const now = context.now()
  const granting = subscriptions.filter((subscription) =>
    isGranting(subscription, { now, graceDays: context.graceDays }),
  )
  const groups = [...new Set(context.plans.map(({ group }) => group))]

  return groups.flatMap((group) => {
    const groupSubscriptions = granting.filter((subscription) => subscription.group === group)
    if (groupSubscriptions.length === 0) {
      return context.plans.filter((plan) => plan.group === group && plan.isDefault)
    }
    return context.plans.filter((plan) =>
      groupSubscriptions.some(({ planId }) => planId === plan.id),
    )
  })
}

export function isMeteredGrant<TGrant extends Grant>(
  grant: TGrant,
): grant is Extract<TGrant, { type: "metered" }> {
  return grant.type === "metered"
}

function grantsOf(context: Context, subscriptions: Subscription[]) {
  return grantingPlans(context, subscriptions).flatMap(({ includes }) => includes)
}

function meteredEntitlement(
  context: Context,
  grants: readonly Grant[],
  featureId: string,
): MeteredEntitlement {
  const featureGrants = grants
    .filter(isMeteredGrant)
    .filter((grant) => grant.featureId === featureId)
  const [configGrant] = context.plans
    .flatMap(({ includes }) => includes)
    .filter(isMeteredGrant)
    .filter((grant) => grant.featureId === featureId)
  const reset = featureGrants[0]?.reset ?? configGrant?.reset ?? "month"

  if (featureGrants.some(({ limit }) => limit === "unlimited")) {
    return { limit: "unlimited", reset }
  }

  const limit = featureGrants.reduce(
    (sum, grant) => (grant.limit === "unlimited" ? sum : sum + grant.limit),
    0,
  )
  return { limit, reset }
}

function balanceOf(
  context: Context,
  {
    customer,
    grants,
    usage,
    featureId,
  }: { customer: Customer; grants: readonly Grant[]; usage: UsageRow[]; featureId: string },
) {
  const entitlement = meteredEntitlement(context, grants, featureId)
  const window = currentWindow(customer.usageAnchorAt, entitlement.reset, context.now())
  const row = usage.find((candidate) => candidate.featureId === featureId)
  const used = row && row.windowStart.getTime() === window.start.getTime() ? row.used : 0
  return toBalance(entitlement, used, window.end)
}

function toBalance({ limit, reset }: MeteredEntitlement, used: number, windowEnd: Date): Balance {
  return {
    limit,
    used,
    remaining: limit === "unlimited" ? "unlimited" : Math.max(limit - used, 0),
    resetsAt: reset === "never" ? null : windowEnd,
  }
}

function isMeteredFeature({ plans }: Context, featureId: string) {
  return plans.some(({ includes }) =>
    includes.some((grant) => grant.featureId === featureId && isMeteredGrant(grant)),
  )
}
