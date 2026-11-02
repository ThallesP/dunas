import type { BillingInterval } from "../catalog/plan.ts"
import { addInterval } from "../lib/period.ts"
import type { Checkout, PaymentMethod } from "../providers/provider.ts"

export type SubscriptionStatus = "pending" | "active" | "past_due" | "canceled"

export type Subscription = {
  id: string
  customerId: string
  planId: string
  group: string
  status: SubscriptionStatus
  method: PaymentMethod
  checkout: Checkout
  provider: string | null
  providerSubscriptionId: string | null
  amountInCents: number
  interval: BillingInterval
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  canceledAt: Date | null
  createdAt: Date
}

export const subscriptionColumns = `
  id, customer_id AS "customerId", plan_id AS "planId", plan_group AS "group", status,
  method, checkout, provider, provider_subscription_id AS "providerSubscriptionId",
  amount_in_cents AS "amountInCents", billing_interval AS "interval",
  current_period_start AS "currentPeriodStart", current_period_end AS "currentPeriodEnd",
  cancel_at_period_end AS "cancelAtPeriodEnd", canceled_at AS "canceledAt", created_at AS "createdAt"
`

export function isGranting(
  subscription: Subscription,
  { now, graceDays }: { now: Date; graceDays: number },
) {
  if (subscription.status !== "active" && subscription.status !== "past_due") {
    return false
  }

  if (!subscription.currentPeriodEnd) {
    return true
  }

  if (subscription.cancelAtPeriodEnd) {
    return now < subscription.currentPeriodEnd
  }

  return now < addInterval(subscription.currentPeriodEnd, "day", graceDays)
}
