import type { Plan } from "../catalog/plan.ts"
import { queryMaybe, queryOne } from "../database/database.ts"
import {
  type Charge,
  chargeColumns,
  type NoneNext,
  nextFor,
  type PixNext,
  type RedirectNext,
} from "../entities/charge.ts"
import type { Customer } from "../entities/customer.ts"
import { type Subscription, subscriptionColumns } from "../entities/subscription.ts"
import { createId } from "../lib/id.ts"
import type { Checkout, PaymentMethod } from "../providers/provider.ts"
import { createCharge } from "./charges.ts"
import type { Context } from "./context.ts"
import { getOrCreateCustomer } from "./customers.ts"
import { DunasError } from "./errors.ts"
import { emit, event } from "./events.ts"
import { detachInBackground, detachProviderSubscription } from "./provider-subscriptions.ts"
import { supports } from "./routing.ts"

export type SubscribeInput = {
  customerId: string
  planId: string
  method?: PaymentMethod
  checkout?: Checkout
  successUrl?: string
}

export type SubscribeResult<TNext extends PixNext | RedirectNext = PixNext | RedirectNext> = {
  subscription: Subscription | null
  next: TNext | NoneNext
}

type StartInput = {
  customer: Customer
  plan: Plan
  current: Subscription[]
  method: PaymentMethod
  checkout: Checkout
  successUrl: string | null
}

const none: NoneNext = { type: "none" }

export async function subscribe(
  context: Context,
  { customerId, planId, method, checkout = "hosted", successUrl }: SubscribeInput,
): Promise<SubscribeResult> {
  const customer = await getOrCreateCustomer(context, customerId)
  const plan = findPlan(context, planId)
  const current = await context.database.query<Subscription>(
    `SELECT ${subscriptionColumns} FROM dunas_subscription
     WHERE customer_id = $1 AND plan_group = $2 AND status IN ('pending', 'active', 'past_due')
     ORDER BY created_at DESC`,
    [customerId, plan.group],
  )

  if (!plan.price && plan.isDefault) {
    return switchToDefaultPlan(context, current)
  }

  if (!plan.price) {
    await cancelNow(context, current)
    const subscription = await insertSubscription(context, {
      customer,
      plan,
      status: "active",
      method: "pix",
      checkout,
    })
    return { subscription, next: none }
  }

  const ongoing = current.find(
    (subscription) => subscription.planId === planId && subscription.status !== "pending",
  )
  if (ongoing) {
    return resumeOngoing(context, ongoing)
  }

  const methods = method ? [method] : preferredMethods(context, checkout)

  for (const [index, candidate] of methods.entries()) {
    const isLastMethod = index === methods.length - 1
    try {
      return await startSubscription(context, {
        customer,
        plan,
        current,
        method: candidate,
        checkout,
        successUrl: successUrl ?? null,
      })
    } catch (error) {
      const canFallBack =
        !isLastMethod &&
        error instanceof DunasError &&
        (error.code === "ALL_PROVIDERS_FAILED" || error.code === "METHOD_NOT_AVAILABLE")
      if (!canFallBack) {
        throw error
      }
    }
  }

  throw new DunasError("METHOD_NOT_AVAILABLE", `No provider offers a ${checkout} checkout`)
}

export async function cancel(
  context: Context,
  {
    customerId,
    planId,
    immediately = false,
  }: { customerId: string; planId: string; immediately?: boolean },
) {
  const subscription = await queryMaybe<Subscription>(
    context.database,
    `SELECT ${subscriptionColumns} FROM dunas_subscription
     WHERE customer_id = $1 AND plan_id = $2 AND status IN ('pending', 'active', 'past_due')
     ORDER BY created_at DESC LIMIT 1`,
    [customerId, planId],
  )
  if (!subscription) {
    return null
  }

  const endsNow = immediately || subscription.status === "pending" || !subscription.currentPeriodEnd
  if (endsNow) {
    const [canceled] = await cancelNow(context, [subscription])
    return canceled ?? null
  }

  await detachProviderSubscription(context, subscription)
  return queryOne<Subscription>(
    context.database,
    `UPDATE dunas_subscription SET cancel_at_period_end = true, updated_at = now()
     WHERE id = $1 RETURNING ${subscriptionColumns}`,
    [subscription.id],
  )
}

export async function listSubscriptions({ database }: Context, customerId: string) {
  return database.query<Subscription>(
    `SELECT ${subscriptionColumns} FROM dunas_subscription
     WHERE customer_id = $1 AND status IN ('pending', 'active', 'past_due')
     ORDER BY created_at`,
    [customerId],
  )
}

export function findPlan({ plans }: Context, planId: string) {
  const plan = plans.find(({ id }) => id === planId)
  if (!plan) {
    throw new DunasError("PLAN_NOT_FOUND", `Plan "${planId}" is not in your plans`)
  }
  return plan
}

function preferredMethods({ providers }: Context, checkout: Checkout) {
  const preference: PaymentMethod[] = ["pix_automatico", "pix"]
  return preference.filter((method) =>
    providers.some((provider) => supports(provider, { method, checkout })),
  )
}

async function startSubscription(
  context: Context,
  { customer, plan, current, method, checkout, successUrl }: StartInput,
): Promise<SubscribeResult> {
  const isSameStart = (subscription: Subscription) =>
    subscription.status === "pending" &&
    subscription.planId === plan.id &&
    subscription.method === method &&
    subscription.checkout === checkout

  await cancelNow(
    context,
    current.filter(
      (subscription) => subscription.status === "pending" && !isSameStart(subscription),
    ),
  )

  const existing = current.find(isSameStart)
  const openCharge = existing ? await findOpenCharge(context, existing) : null
  if (existing && openCharge) {
    return { subscription: existing, next: nextFor(openCharge) }
  }

  if (existing) {
    await detachInBackground(context, [existing])
  }

  const subscription =
    existing ??
    (await insertSubscription(context, { customer, plan, status: "pending", method, checkout }))

  try {
    const charge = await createCharge(context, {
      customer,
      subscription,
      reason: "subscription_start",
      item: { id: plan.id, name: plan.name },
      description: `Assinatura ${plan.name}`,
      expiresInSeconds: context.chargeExpiresInSeconds,
      periodStart: null,
      periodEnd: null,
      successUrl,
    })
    const started = await queryOne<Subscription>(
      context.database,
      `SELECT ${subscriptionColumns} FROM dunas_subscription WHERE id = $1`,
      [subscription.id],
    )
    return { subscription: started, next: nextFor(charge) }
  } catch (error) {
    if (!existing) {
      await context.database.query("DELETE FROM dunas_subscription WHERE id = $1", [
        subscription.id,
      ])
    }
    throw error
  }
}

async function switchToDefaultPlan(
  context: Context,
  current: Subscription[],
): Promise<SubscribeResult> {
  const paid = current.filter(
    (subscription) => subscription.status !== "pending" && subscription.currentPeriodEnd,
  )
  await cancelNow(
    context,
    current.filter((subscription) => !paid.includes(subscription)),
  )

  for (const subscription of paid) {
    await detachProviderSubscription(context, subscription)
  }

  const [scheduled] = await context.database.query<Subscription>(
    `UPDATE dunas_subscription SET cancel_at_period_end = true, updated_at = now()
     WHERE id = ANY($1) RETURNING ${subscriptionColumns}`,
    [paid.map(({ id }) => id)],
  )

  return { subscription: scheduled ?? null, next: none }
}

async function resumeOngoing(
  context: Context,
  subscription: Subscription,
): Promise<SubscribeResult> {
  if (subscription.status === "past_due") {
    const charge = await findOpenCharge(context, subscription)
    if (charge) {
      return { subscription, next: nextFor(charge) }
    }
  }

  if (!subscription.cancelAtPeriodEnd) {
    return { subscription, next: none }
  }

  const resumed = await queryOne<Subscription>(
    context.database,
    `UPDATE dunas_subscription SET cancel_at_period_end = false,
       method = CASE WHEN provider_subscription_id IS NULL THEN 'pix' ELSE method END,
       updated_at = now()
     WHERE id = $1 RETURNING ${subscriptionColumns}`,
    [subscription.id],
  )
  return { subscription: resumed, next: none }
}

async function insertSubscription(
  context: Context,
  {
    customer,
    plan,
    status,
    method,
    checkout,
  }: {
    customer: Customer
    plan: Plan
    status: "pending" | "active"
    method: PaymentMethod
    checkout: Checkout
  },
) {
  return queryOne<Subscription>(
    context.database,
    `INSERT INTO dunas_subscription (
       id, customer_id, plan_id, plan_group, status, method, checkout, amount_in_cents, billing_interval
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${subscriptionColumns}`,
    [
      createId("sub"),
      customer.id,
      plan.id,
      plan.group,
      status,
      method,
      checkout,
      plan.price?.amountInCents ?? 0,
      plan.price?.interval ?? "month",
    ],
  )
}

async function cancelNow(context: Context, subscriptions: Subscription[]) {
  if (subscriptions.length === 0) {
    return []
  }

  const canceled = await context.database.query<Subscription>(
    `UPDATE dunas_subscription SET status = 'canceled', canceled_at = $2, updated_at = now()
     WHERE id = ANY($1) RETURNING ${subscriptionColumns}`,
    [subscriptions.map(({ id }) => id), context.now()],
  )
  await detachInBackground(context, canceled)
  await emit(
    canceled.map((subscription) => event(context, "subscription.canceled", { subscription })),
  )
  return canceled
}

async function findOpenCharge(context: Context, subscription: Subscription) {
  return queryMaybe<Charge>(
    context.database,
    `SELECT ${chargeColumns} FROM dunas_charge
     WHERE subscription_id = $1 AND method = $2 AND checkout = $3
       AND status = 'pending' AND expires_at > $4
     ORDER BY created_at DESC LIMIT 1`,
    [
      subscription.id,
      subscription.method,
      subscription.checkout,
      new Date(context.now().getTime() + 60_000),
    ],
  )
}
