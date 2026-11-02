import { type Queryable, queryOne } from "../database/database.ts"
import { type Charge, chargeColumns } from "../entities/charge.ts"
import { type Subscription, subscriptionColumns } from "../entities/subscription.ts"
import { addInterval } from "../lib/period.ts"
import type { ProviderChargeState } from "../providers/provider.ts"
import type { Context } from "./context.ts"
import { emit, event, type PendingEvent } from "./events.ts"
import { detachInBackground } from "./provider-subscriptions.ts"

export async function settleCharge(
  context: Context,
  chargeId: string,
  { status, paidAt }: ProviderChargeState,
) {
  const events: PendingEvent[] = []
  const replaced: Subscription[] = []

  const charge = await context.database.transaction(async (tx) => {
    const current = await queryOne<Charge>(
      tx,
      `SELECT ${chargeColumns} FROM dunas_charge WHERE id = $1 FOR UPDATE`,
      [chargeId],
    )

    const updated = await queryOne<Charge>(
      tx,
      `UPDATE dunas_charge SET status = $2, paid_at = COALESCE(paid_at, $3), synced_at = $4, updated_at = now()
       WHERE id = $1 RETURNING ${chargeColumns}`,
      [chargeId, status, status === "paid" ? (paidAt ?? context.now()) : null, context.now()],
    )

    const isLatePayment = current.status === "expired" && status === "paid"
    if ((current.status !== "pending" && !isLatePayment) || status === "pending") {
      return updated
    }

    if (status !== "paid") {
      events.push(event(context, "charge.expired", { charge: updated }))
      return updated
    }

    events.push(event(context, "charge.paid", { charge: updated }))
    events.push(...(await applyPaidCharge(context, tx, updated, replaced)))
    return updated
  })

  await detachInBackground(context, replaced)
  await emit(events)
  return charge
}

async function applyPaidCharge(
  context: Context,
  tx: Queryable,
  charge: Charge,
  replaced: Subscription[],
) {
  if (!charge.subscriptionId) {
    return []
  }

  const subscription = await queryOne<Subscription>(
    tx,
    `SELECT ${subscriptionColumns} FROM dunas_subscription WHERE id = $1 FOR UPDATE`,
    [charge.subscriptionId],
  )
  const paidAt = charge.paidAt ?? context.now()
  const isRenewalOfCurrentPeriod =
    charge.reason === "subscription_renewal" &&
    subscription.status !== "canceled" &&
    charge.periodStart?.getTime() === subscription.currentPeriodEnd?.getTime()

  if (isRenewalOfCurrentPeriod && charge.periodStart && charge.periodEnd) {
    const renewed = await updatePeriod(tx, subscription.id, charge.periodStart, charge.periodEnd)
    return [event(context, "subscription.renewed", { subscription: renewed })]
  }

  if (subscription.status === "active" && charge.reason === "subscription_start") {
    return []
  }

  const activated = await updatePeriod(
    tx,
    subscription.id,
    paidAt,
    addInterval(paidAt, subscription.interval),
  )
  await tx.query(
    "UPDATE dunas_customer SET usage_anchor_at = $2, updated_at = now() WHERE id = $1",
    [subscription.customerId, paidAt],
  )

  const canceled = await tx.query<Subscription>(
    `UPDATE dunas_subscription SET status = 'canceled', canceled_at = $4, updated_at = now()
     WHERE customer_id = $1 AND plan_group = $2 AND id <> $3 AND status IN ('pending', 'active', 'past_due')
     RETURNING ${subscriptionColumns}`,
    [subscription.customerId, subscription.group, subscription.id, context.now()],
  )
  replaced.push(...canceled)

  return [
    ...canceled.map((replacedSubscription) =>
      event(context, "subscription.canceled", { subscription: replacedSubscription }),
    ),
    event(context, "subscription.activated", { subscription: activated }),
  ]
}

function updatePeriod(tx: Queryable, subscriptionId: string, periodStart: Date, periodEnd: Date) {
  return queryOne<Subscription>(
    tx,
    `UPDATE dunas_subscription
     SET status = 'active', current_period_start = $2, current_period_end = $3, canceled_at = NULL, updated_at = now()
     WHERE id = $1 RETURNING ${subscriptionColumns}`,
    [subscriptionId, periodStart, periodEnd],
  )
}
