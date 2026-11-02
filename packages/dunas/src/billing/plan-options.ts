import type { BillingInterval, Plan } from "../catalog/plan.ts"
import { isGranting, type Subscription } from "../entities/subscription.ts"
import type { Context } from "./context.ts"
import { getOrCreateCustomer } from "./customers.ts"
import { grantingPlans } from "./entitlements.ts"
import { listSubscriptions } from "./subscriptions.ts"

export type PlanAction =
  | "current"
  | "resume"
  | "scheduled"
  | "pending_payment"
  | "subscribe"
  | "upgrade"
  | "downgrade"

const monthsPerInterval: Record<BillingInterval, number> = {
  week: 12 / 52,
  month: 1,
  year: 12,
}

export async function listPlans<TPlan extends Plan>(
  context: Context,
  plans: readonly TPlan[],
  customerId: string,
) {
  await getOrCreateCustomer(context, customerId)
  const subscriptions = await listSubscriptions(context, customerId)
  const currentPlans = grantingPlans(context, subscriptions)

  return plans.map((plan) => {
    const subscription = subscriptions.find(({ planId }) => planId === plan.id) ?? null
    const action = actionFor(context, { plan, subscription, subscriptions, currentPlans })
    return { ...plan, action, subscription }
  })
}

function actionFor(
  context: Context,
  {
    plan,
    subscription,
    subscriptions,
    currentPlans,
  }: {
    plan: Plan
    subscription: Subscription | null
    subscriptions: Subscription[]
    currentPlans: readonly Plan[]
  },
): PlanAction {
  if (subscription?.status === "pending" || subscription?.status === "past_due") {
    return "pending_payment"
  }

  if (
    subscription &&
    isGranting(subscription, { now: context.now(), graceDays: context.graceDays })
  ) {
    return subscription.cancelAtPeriodEnd ? "resume" : "current"
  }

  const groupCurrent = currentPlans.find(({ group }) => group === plan.group)
  if (groupCurrent?.id === plan.id) {
    return "current"
  }

  const isLeavingGroup = subscriptions.some(
    ({ group, cancelAtPeriodEnd }) => group === plan.group && cancelAtPeriodEnd,
  )
  if (plan.isDefault && isLeavingGroup) {
    return "scheduled"
  }

  if (!groupCurrent) {
    return "subscribe"
  }

  return monthlyPriceInCents(plan) > monthlyPriceInCents(groupCurrent) ? "upgrade" : "downgrade"
}

function monthlyPriceInCents({ price }: Plan) {
  if (!price) {
    return 0
  }
  return price.amountInCents / monthsPerInterval[price.interval]
}
