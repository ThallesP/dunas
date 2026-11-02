import { queryOne } from "../database/database.ts"
import type { Customer } from "../entities/customer.ts"
import { customerColumns } from "../entities/customer.ts"
import { type Subscription, subscriptionColumns } from "../entities/subscription.ts"
import { addInterval } from "../lib/period.ts"
import { createCharge, syncCharge } from "./charges.ts"
import type { Context } from "./context.ts"
import { emit, event } from "./events.ts"
import { detachInBackground } from "./provider-subscriptions.ts"

export async function runRenewals(context: Context) {
  const chargesSynced = await syncExpiredCharges(context)
  const canceled = await cancelEndedSubscriptions(context)
  const pastDue = await markPastDue(context)
  const { chargesCreated, failures } = await createRenewalCharges(context)

  return { chargesSynced, canceled, pastDue, chargesCreated, failures }
}

async function syncExpiredCharges(context: Context) {
  const expired = await context.database.query<{ id: string }>(
    "SELECT id FROM dunas_charge WHERE status = 'pending' AND expires_at <= $1",
    [context.now()],
  )

  for (const { id } of expired) {
    await syncCharge(context, id)
  }
  return expired.length
}

async function cancelEndedSubscriptions(context: Context) {
  const now = context.now()
  const canceled = await context.database.query<Subscription>(
    `UPDATE dunas_subscription SET status = 'canceled', canceled_at = $1, updated_at = now()
     WHERE status IN ('active', 'past_due') AND current_period_end IS NOT NULL AND (
       (cancel_at_period_end AND current_period_end <= $1) OR current_period_end <= $2
     )
     RETURNING ${subscriptionColumns}`,
    [now, addInterval(now, "day", -context.graceDays)],
  )

  await detachInBackground(context, canceled)
  await emit(
    canceled.map((subscription) => event(context, "subscription.canceled", { subscription })),
  )
  return canceled.length
}

async function markPastDue(context: Context) {
  const pastDue = await context.database.query<Subscription>(
    `UPDATE dunas_subscription SET status = 'past_due', updated_at = now()
     WHERE status = 'active' AND method = 'pix' AND NOT cancel_at_period_end AND current_period_end <= $1
     RETURNING ${subscriptionColumns}`,
    [context.now()],
  )

  await emit(
    pastDue.map((subscription) => event(context, "subscription.past_due", { subscription })),
  )
  return pastDue.length
}

async function createRenewalCharges(context: Context) {
  const now = context.now()
  const due = await context.database.query<Subscription>(
    `SELECT ${subscriptionColumns} FROM dunas_subscription s
     WHERE status IN ('active', 'past_due') AND method = 'pix' AND NOT cancel_at_period_end
       AND current_period_end <= $1
       AND NOT EXISTS (
         SELECT 1 FROM dunas_charge c
         WHERE c.subscription_id = s.id AND c.reason = 'subscription_renewal'
           AND c.period_start = s.current_period_end
           AND (c.status = 'paid' OR (c.status = 'pending' AND c.expires_at > $2))
       )`,
    [addInterval(now, "day", context.renewDaysBefore), now],
  )

  const failures: { subscriptionId: string; error: unknown }[] = []

  for (const subscription of due) {
    try {
      await createRenewalCharge(context, subscription)
    } catch (error) {
      failures.push({ subscriptionId: subscription.id, error })
    }
  }

  return { chargesCreated: due.length - failures.length, failures }
}

async function createRenewalCharge(context: Context, subscription: Subscription) {
  const now = context.now()
  const customer = await queryOne<Customer>(
    context.database,
    `SELECT ${customerColumns} FROM dunas_customer WHERE id = $1`,
    [subscription.customerId],
  )
  const periodStart = subscription.currentPeriodEnd ?? now
  const payableUntil = addInterval(periodStart, "day", context.graceDays)
  const planName =
    context.plans.find(({ id }) => id === subscription.planId)?.name ?? subscription.planId

  return createCharge(context, {
    customer,
    subscription,
    reason: "subscription_renewal",
    item: { id: subscription.planId, name: planName },
    description: `Renovação ${planName}`,
    expiresInSeconds: Math.max(3_600, Math.round((payableUntil.getTime() - now.getTime()) / 1_000)),
    periodStart,
    periodEnd: addInterval(periodStart, subscription.interval),
    successUrl: null,
  })
}
