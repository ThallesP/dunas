import { createServerFn } from "@tanstack/react-start"
import { getCookie, getRequestUrl, setCookie } from "@tanstack/react-start/server"
import { currentUser } from "../lib/session.ts"
import { billing, type Method, paymentMethods } from "./dunas.ts"

type PlanId = "free" | "pro"

const chargeCookie = "agendai_charge"

function toMethod(value: string): Method {
  const method = paymentMethods.find((enabled) => enabled === value)
  if (!method) {
    throw new Error(`Forma de pagamento indisponível: ${value}`)
  }
  return method
}

function toPlanId(value: string): PlanId {
  if (value !== "free" && value !== "pro") {
    throw new Error(`Plano desconhecido: ${value}`)
  }
  return value
}

export const getUsage = createServerFn().handler(async () => {
  const { id } = currentUser()
  const [{ balances, flags }, plans] = await Promise.all([
    billing.getCustomer({ customerId: id }),
    billing.listPlans({ customerId: id }),
  ])
  const currentPlan = plans.find(({ action }) => action === "current" || action === "resume")
  return {
    bookings: balances.bookings,
    hasReports: flags.reports,
    planName: currentPlan?.name ?? "Grátis",
  }
})

export const getPlans = createServerFn().handler(async () => {
  const plans = await billing.listPlans({ customerId: currentUser().id })
  const leaving = plans.find(({ subscription }) => subscription?.cancelAtPeriodEnd)
  return {
    changesAt: leaving?.subscription?.currentPeriodEnd ?? null,
    plans: plans.map(({ id, name, price, includes, action }) => ({
      id,
      name,
      price,
      action,
      bookingsLimit:
        includes.flatMap((grant) => (grant.type === "metered" ? [grant.limit] : []))[0] ?? 0,
    })),
  }
})

export const getCheckout = createServerFn()
  .validator((planId: string) => planId)
  .handler(async ({ data: planId }) => {
    const plans = await billing.listPlans({ customerId: currentUser().id })
    const plan = plans.find(({ id, price }) => id === planId && price)
    if (!plan?.price) {
      return null
    }
    return { id: plan.id, name: plan.name, price: plan.price, action: plan.action, paymentMethods }
  })

export const startSubscription = createServerFn({ method: "POST" })
  .validator((input: { planId: string; method: string }) => ({
    planId: toPlanId(input.planId),
    method: toMethod(input.method),
  }))
  .handler(async ({ data: { planId, method } }) => {
    const { next } = await billing.subscribe({
      customerId: currentUser().id,
      planId,
      method,
      checkout: method === "pix" ? "embedded" : "hosted",
      successUrl: new URL("/assinatura?pagamento=confirmando", getRequestUrl()).href,
    })
    if (next.type !== "none") {
      setCookie(chargeCookie, next.chargeId, { path: "/", httpOnly: true, sameSite: "lax" })
    }
    return next
  })

export const getPaymentStatus = createServerFn().handler(async () => {
  const chargeId = getCookie(chargeCookie)
  if (!chargeId) {
    return null
  }

  const charge = await billing.getCharge({ chargeId })
  if (charge.customerId !== currentUser().id) {
    return null
  }
  const { status } = await billing.syncCharge({ chargeId })
  return status
})

export const getSubscription = createServerFn().handler(async () => {
  const { id } = currentUser()
  const [{ balances, subscriptions }, plans] = await Promise.all([
    billing.getCustomer({ customerId: id }),
    billing.listPlans({ customerId: id }),
  ])
  const subscription = subscriptions.find(({ status }) => status !== "pending") ?? null
  const pending = subscriptions.find(({ status }) => status === "pending") ?? null
  const plan =
    plans.find(({ id }) => id === subscription?.planId) ?? plans.find(({ isDefault }) => isDefault)

  return {
    plan: plan ? { id: plan.id, name: plan.name, price: plan.price } : null,
    subscription: subscription && {
      status: subscription.status,
      method: subscription.method,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    },
    pendingPlanId: pending?.planId ?? null,
    bookings: balances.bookings,
  }
})

export const changePlan = createServerFn({ method: "POST" })
  .validator((planId: string) => toPlanId(planId))
  .handler(async ({ data: planId }) => {
    await billing.subscribe({ customerId: currentUser().id, planId })
  })

export const cancelSubscription = createServerFn({ method: "POST" }).handler(async () => {
  await billing.cancel({ customerId: currentUser().id, planId: "pro" })
})
