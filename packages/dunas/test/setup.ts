import { PGlite } from "@electric-sql/pglite"
import type { Routing } from "../src/billing/context.ts"
import type { Next } from "../src/entities/charge.ts"
import { createDunas, feature, pglite, plan } from "../src/index.ts"
import type { PaymentProvider } from "../src/providers/provider.ts"
import { fakeProvider } from "./fake-provider.ts"

export const messages = feature({ id: "messages", type: "metered" })
export const seats = feature({ id: "seats", type: "metered" })
export const proModels = feature({ id: "pro_models", type: "boolean" })

export const free = plan({
  id: "free",
  default: true,
  includes: [messages({ limit: 10 }), seats({ limit: 1, reset: "never" })],
})

export const pro = plan({
  id: "pro",
  price: { amountInCents: 4_990, interval: "month" },
  includes: [messages({ limit: 1_000 }), seats({ limit: 5, reset: "never" }), proModels()],
})

export const business = plan({
  id: "business",
  price: { amountInCents: 19_990, interval: "month" },
  includes: [messages({ limit: "unlimited" }), seats({ limit: 50, reset: "never" }), proModels()],
})

export const extraMessages = plan({
  id: "extra_messages",
  group: "addons",
  price: { amountInCents: 990, interval: "month" },
  includes: [messages({ limit: 500 })],
})

export async function setup({
  providers = [fakeProvider("woovi"), fakeProvider("abacatepay")],
  routing,
}: {
  providers?: [PaymentProvider, ...PaymentProvider[]]
  routing?: Routing<string>
} = {}) {
  const clock = { now: new Date("2026-01-31T12:00:00Z") }
  const events: { type: string; id: string }[] = []

  const billing = createDunas({
    database: pglite(new PGlite()),
    plans: [free, pro, business, extraMessages],
    providers,
    routing,
    now: () => clock.now,
    identify: (request) => {
      const customerId = request.headers.get("x-user")
      return customerId ? { id: customerId, name: "Ana" } : null
    },
    cronSecret: "cron-secret",
    on: {
      "charge.created": ({ charge }) => {
        events.push({ type: "charge.created", id: charge.id })
      },
      "subscription.activated": ({ subscription }) => {
        events.push({ type: "subscription.activated", id: subscription.planId })
      },
      "subscription.renewed": ({ subscription }) => {
        events.push({ type: "subscription.renewed", id: subscription.planId })
      },
      "subscription.past_due": ({ subscription }) => {
        events.push({ type: "subscription.past_due", id: subscription.planId })
      },
      "subscription.canceled": ({ subscription }) => {
        events.push({ type: "subscription.canceled", id: subscription.planId })
      },
    },
  })

  await billing.migrate()
  await billing.upsertCustomer({
    id: "user_1",
    name: "Ana Souza",
    email: "ana@example.com",
    taxId: "529.982.247-25",
  })

  function advance(days: number) {
    clock.now = new Date(clock.now.getTime() + days * 86_400_000)
  }

  return { billing, clock, events, advance }
}

export function chargeIdOf({ next }: { next: Next }) {
  if (next.type === "none") {
    throw new Error("expected a payment to complete")
  }
  return next.chargeId
}
