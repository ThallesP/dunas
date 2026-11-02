import { queryMaybe, queryOne } from "../database/database.ts"
import { type Charge, chargeColumns } from "../entities/charge.ts"
import { type Subscription, subscriptionColumns } from "../entities/subscription.ts"
import { createId } from "../lib/id.ts"
import { addInterval } from "../lib/period.ts"
import type { PaymentProvider, ProviderEvent } from "../providers/provider.ts"
import { syncProviderCharge } from "./charges.ts"
import type { Context } from "./context.ts"
import { emit, event } from "./events.ts"
import { detachInBackground } from "./provider-subscriptions.ts"
import { settleCharge } from "./settlement.ts"

type PaidEvent = Extract<ProviderEvent, { type: "subscription.paid" }>
type EndedEvent = Extract<ProviderEvent, { type: "subscription.ended" }>

export async function applyProviderEvents(
  context: Context,
  provider: PaymentProvider,
  events: ProviderEvent[],
) {
  for (const providerEvent of events) {
    if (providerEvent.type === "charge.updated") {
      await syncProviderCharge(context, provider.id, providerEvent.providerChargeId)
      continue
    }

    if (providerEvent.type === "subscription.paid") {
      await applySubscriptionPayment(context, provider, providerEvent)
      continue
    }

    await endProviderSubscription(context, provider, providerEvent)
  }
}

async function applySubscriptionPayment(
  context: Context,
  provider: PaymentProvider,
  payment: PaidEvent,
) {
  const references = [payment.providerSubscriptionId, payment.checkoutId].filter(
    (reference) => reference !== null,
  )
  const subscription = await queryMaybe<Subscription>(
    context.database,
    `SELECT ${subscriptionColumns} FROM dunas_subscription
     WHERE provider = $1 AND provider_subscription_id = ANY($2)`,
    [provider.id, references],
  )
  if (!subscription) {
    return
  }

  if (subscription.providerSubscriptionId !== payment.providerSubscriptionId) {
    await context.database.query(
      "UPDATE dunas_subscription SET provider_subscription_id = $2, updated_at = now() WHERE id = $1",
      [subscription.id, payment.providerSubscriptionId],
    )
  }

  if (payment.isFirstPayment) {
    const start = await queryMaybe<{ id: string }>(
      context.database,
      `SELECT id FROM dunas_charge
       WHERE subscription_id = $1 AND provider = $2 AND reason = 'subscription_start'
       ORDER BY created_at DESC LIMIT 1`,
      [subscription.id, provider.id],
    )
    if (start) {
      await settleCharge(context, start.id, { status: "paid", paidAt: payment.paidAt })
    }
    return
  }

  const paidAt = payment.paidAt ?? context.now()
  const periodStart = subscription.currentPeriodEnd ?? paidAt
  const charge = await queryMaybe<Charge>(
    context.database,
    `INSERT INTO dunas_charge (
       id, customer_id, subscription_id, reason, provider, provider_charge_id, method, checkout,
       amount_in_cents, status, period_start, period_end, expires_at, synced_at
     ) VALUES ($1, $2, $3, 'subscription_renewal', $4, $5, $6, $7, $8, 'pending', $9, $10, $11, $12)
     ON CONFLICT (provider, provider_charge_id) DO NOTHING
     RETURNING ${chargeColumns}`,
    [
      createId("chg"),
      subscription.customerId,
      subscription.id,
      provider.id,
      payment.providerPaymentId,
      subscription.method,
      subscription.checkout,
      payment.amountInCents,
      periodStart,
      addInterval(periodStart, subscription.interval),
      paidAt,
      context.now(),
    ],
  )
  if (charge) {
    await settleCharge(context, charge.id, { status: "paid", paidAt })
  }
}

async function endProviderSubscription(
  context: Context,
  provider: PaymentProvider,
  { providerSubscriptionId, reason }: EndedEvent,
) {
  const subscription = await queryMaybe<Subscription>(
    context.database,
    `SELECT ${subscriptionColumns} FROM dunas_subscription
     WHERE provider = $1 AND provider_subscription_id = $2 AND status <> 'canceled'`,
    [provider.id, providerSubscriptionId],
  )
  if (!subscription) {
    return
  }

  if (reason === "failed") {
    await detachInBackground(context, [subscription])
  }

  const switched = await queryOne<Subscription>(
    context.database,
    `UPDATE dunas_subscription SET method = 'pix', provider_subscription_id = NULL, updated_at = now()
     WHERE id = $1 RETURNING ${subscriptionColumns}`,
    [subscription.id],
  )
  await emit([
    event(context, "subscription.method_changed", {
      subscription: switched,
      previousMethod: subscription.method,
    }),
  ])
}
