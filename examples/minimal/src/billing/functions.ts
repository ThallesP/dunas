import { createServerFn } from "@tanstack/react-start"
import { getRequestUrl } from "@tanstack/react-start/server"
import { currentUser } from "../lib/session.ts"
import { billing } from "./dunas.ts"

export const getUsage = createServerFn().handler(async () => {
  const { id } = currentUser()
  const [{ balances }, plans] = await Promise.all([
    billing.getCustomer({ customerId: id }),
    billing.listPlans({ customerId: id }),
  ])
  const currentPlan = plans.find(({ action }) => action === "current" || action === "resume")
  return { bookings: balances.bookings, planName: currentPlan?.name ?? "Grátis" }
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

export const subscribe = createServerFn({ method: "POST" })
  .validator((planId: "free" | "pro") => planId)
  .handler(async ({ data: planId }) => {
    const { next } = await billing.subscribe({
      customerId: currentUser().id,
      planId,
      successUrl: new URL("/", getRequestUrl()).href,
    })
    return next
  })
