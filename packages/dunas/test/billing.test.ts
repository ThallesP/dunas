import { PGlite } from "@electric-sql/pglite"
import { describe, expect, it, vi } from "vitest"
import { createDunas, pglite } from "../src/index.ts"
import { fakeProvider } from "./fake-provider.ts"
import { chargeIdOf, free, setup } from "./setup.ts"

async function payFor(billing: Awaited<ReturnType<typeof setup>>["billing"], chargeId: string) {
  return billing.simulatePayment({ chargeId })
}

describe("subscriptions", () => {
  it("gives the default plan to a new customer", async () => {
    const { billing } = await setup()

    const customer = await billing.getCustomer({ customerId: "user_1" })

    expect(customer.subscriptions).toEqual([])
    expect(customer.balances.messages).toMatchObject({ limit: 10, used: 0, remaining: 10 })
    expect(customer.flags).toEqual({ pro_models: false })
  })

  it("activates a paid plan only after the Pix charge is paid", async () => {
    const { billing, events } = await setup()

    const result = await billing.subscribe({ customerId: "user_1", planId: "pro" })
    expect(result.next).toMatchObject({ type: "redirect", url: expect.stringContaining("woovi") })
    expect(await billing.getCharge({ chargeId: chargeIdOf(result) })).toMatchObject({
      amountInCents: 4_990,
      status: "pending",
      provider: "woovi",
      method: "pix",
      checkout: "hosted",
    })
    expect((await billing.check({ customerId: "user_1", featureId: "pro_models" })).allowed).toBe(
      false,
    )

    const paid = await payFor(billing, chargeIdOf(result))

    expect(paid.status).toBe("paid")
    expect((await billing.check({ customerId: "user_1", featureId: "pro_models" })).allowed).toBe(
      true,
    )
    const [subscription] = (await billing.getCustomer({ customerId: "user_1" })).subscriptions
    expect(subscription).toMatchObject({
      planId: "pro",
      status: "active",
      currentPeriodStart: new Date("2026-01-31T12:00:00Z"),
      currentPeriodEnd: new Date("2026-02-28T12:00:00Z"),
    })
    expect(events.map(({ type }) => type)).toEqual(["charge.created", "subscription.activated"])
  })

  it("returns the same open charge when subscribe is called twice", async () => {
    const { billing } = await setup()

    const first = await billing.subscribe({ customerId: "user_1", planId: "pro" })
    const second = await billing.subscribe({ customerId: "user_1", planId: "pro" })

    expect(first.next.type).toBe("redirect")
    expect(first).toEqual(second)
  })

  it("replaces the old plan in the same group once the upgrade is paid", async () => {
    const { billing } = await setup()
    const pro = await billing.subscribe({ customerId: "user_1", planId: "pro" })
    await payFor(billing, chargeIdOf(pro))

    const business = await billing.subscribe({ customerId: "user_1", planId: "business" })
    expect(
      (await billing.getCustomer({ customerId: "user_1" })).subscriptions.map(
        ({ planId }) => planId,
      ),
    ).toEqual(["pro", "business"])

    await payFor(billing, chargeIdOf(business))

    const customer = await billing.getCustomer({ customerId: "user_1" })
    expect(customer.subscriptions.map(({ planId, status }) => [planId, status])).toEqual([
      ["business", "active"],
    ])
    expect(customer.balances.messages).toMatchObject({ limit: "unlimited", remaining: "unlimited" })
  })

  it("stacks plans from different groups", async () => {
    const { billing } = await setup()
    const addon = await billing.subscribe({ customerId: "user_1", planId: "extra_messages" })

    await payFor(billing, chargeIdOf(addon))

    const { balances } = await billing.getCustomer({ customerId: "user_1" })
    expect(balances.messages).toMatchObject({ limit: 510 })
  })

  it("cancels at period end when downgrading to the default plan", async () => {
    const { billing, advance } = await setup()
    const pro = await billing.subscribe({ customerId: "user_1", planId: "pro" })
    await payFor(billing, chargeIdOf(pro))

    const downgrade = await billing.subscribe({ customerId: "user_1", planId: "free" })

    expect(downgrade).toMatchObject({
      next: { type: "none" },
      subscription: { cancelAtPeriodEnd: true },
    })
    expect((await billing.check({ customerId: "user_1", featureId: "pro_models" })).allowed).toBe(
      true,
    )
    advance(29)
    expect((await billing.check({ customerId: "user_1", featureId: "pro_models" })).allowed).toBe(
      false,
    )
    const renewals = await billing.runRenewals()
    expect(renewals).toMatchObject({ canceled: 1, chargesCreated: 0 })
  })
})

describe("customers", () => {
  it("creates an unknown customer on the default plan the first time it is used", async () => {
    const { billing } = await setup()

    const { allowed, balance } = await billing.consume({
      customerId: "user_new",
      featureId: "messages",
    })

    expect(allowed).toBe(true)
    expect(balance).toMatchObject({ limit: 10, used: 1 })
    expect(await billing.getCustomer({ customerId: "user_new" })).toMatchObject({
      id: "user_new",
      name: null,
    })
  })

  it("fills in details later without erasing what it already knows", async () => {
    const { billing } = await setup()

    await billing.upsertCustomer({ id: "user_1", phone: "(11) 98888-7777" })

    expect(await billing.getCustomer({ customerId: "user_1" })).toMatchObject({
      name: "Ana Souza",
      email: "ana@example.com",
      taxId: "52998224725",
      phone: "5511988887777",
    })
  })
})

describe("listPlans", () => {
  async function actions(billing: Awaited<ReturnType<typeof setup>>["billing"]) {
    const plans = await billing.listPlans({ customerId: "user_1" })
    return Object.fromEntries(plans.map(({ id, action }) => [id, action]))
  }

  it("tells a free customer what each plan's button does", async () => {
    const { billing } = await setup()

    expect(await actions(billing)).toEqual({
      free: "current",
      pro: "upgrade",
      business: "upgrade",
      extra_messages: "subscribe",
    })
  })

  it("follows the customer through paying, upgrading and cancelling", async () => {
    const { billing } = await setup()
    const pro = await billing.subscribe({ customerId: "user_1", planId: "pro" })

    expect(await actions(billing)).toMatchObject({ free: "current", pro: "pending_payment" })

    await payFor(billing, chargeIdOf(pro))
    expect(await actions(billing)).toMatchObject({
      free: "downgrade",
      pro: "current",
      business: "upgrade",
    })

    await billing.cancel({ customerId: "user_1", planId: "pro" })
    expect(await actions(billing)).toMatchObject({ free: "scheduled", pro: "resume" })
  })
})

describe("usage", () => {
  it("consumes up to the limit and refuses past it", async () => {
    const { billing } = await setup()

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        billing.consume({ customerId: "user_1", featureId: "messages" }),
      ),
    )

    expect(results.filter(({ allowed }) => allowed)).toHaveLength(10)
    expect((await billing.check({ customerId: "user_1", featureId: "messages" })).allowed).toBe(
      false,
    )
  })

  it("tracks past the limit, since the work already happened", async () => {
    const { billing } = await setup()

    const { balance } = await billing.track({
      customerId: "user_1",
      featureId: "messages",
      amount: 15,
    })

    expect(balance).toMatchObject({ used: 15, remaining: 0 })
  })

  it("ignores a repeated idempotency key", async () => {
    const { billing } = await setup()

    await billing.track({
      customerId: "user_1",
      featureId: "messages",
      amount: 3,
      idempotencyKey: "req_1",
    })
    const { balance } = await billing.track({
      customerId: "user_1",
      featureId: "messages",
      amount: 3,
      idempotencyKey: "req_1",
    })

    expect(balance).toMatchObject({ used: 3 })
  })

  it("resets monthly usage on the anchor day and keeps lifetime usage", async () => {
    const { billing, advance } = await setup()
    await billing.track({ customerId: "user_1", featureId: "messages", amount: 7 })
    await billing.consume({ customerId: "user_1", featureId: "seats" })

    advance(28)
    const { balances } = await billing.getCustomer({ customerId: "user_1" })

    expect(balances.messages).toMatchObject({ used: 0, resetsAt: new Date("2026-03-31T12:00:00Z") })
    expect(balances.seats).toMatchObject({ used: 1, remaining: 0, resetsAt: null })
  })

  it("releases a seat with a negative amount", async () => {
    const { billing } = await setup()
    await billing.consume({ customerId: "user_1", featureId: "seats" })

    await billing.track({ customerId: "user_1", featureId: "seats", amount: -1 })

    expect((await billing.check({ customerId: "user_1", featureId: "seats" })).allowed).toBe(true)
  })
})

describe("renewals", () => {
  async function activePro() {
    const context = await setup()
    const pro = await context.billing.subscribe({ customerId: "user_1", planId: "pro" })
    await payFor(context.billing, chargeIdOf(pro))
    return context
  }

  it("creates a renewal charge a few days before the period ends and extends the period once paid", async () => {
    const { billing, advance, events } = await activePro()

    advance(20)
    expect(await billing.runRenewals()).toMatchObject({ chargesCreated: 0 })
    advance(5)
    const first = await billing.runRenewals()
    const second = await billing.runRenewals()
    expect(first).toMatchObject({ chargesCreated: 1 })
    expect(second).toMatchObject({ chargesCreated: 0 })

    const renewal = events.filter(({ type }) => type === "charge.created").at(-1)
    await billing.simulatePayment({ chargeId: renewal?.id ?? "" })

    const [subscription] = (await billing.getCustomer({ customerId: "user_1" })).subscriptions
    expect(subscription).toMatchObject({
      status: "active",
      currentPeriodStart: new Date("2026-02-28T12:00:00Z"),
      currentPeriodEnd: new Date("2026-03-28T12:00:00Z"),
    })
    expect(events.map(({ type }) => type)).toContain("subscription.renewed")
  })

  it("goes past due, keeps access through the grace period, then cancels", async () => {
    const { billing, advance, events } = await activePro()

    advance(29)
    expect(await billing.runRenewals()).toMatchObject({ pastDue: 1, chargesCreated: 1 })
    expect((await billing.check({ customerId: "user_1", featureId: "pro_models" })).allowed).toBe(
      true,
    )

    advance(3)
    expect(await billing.runRenewals()).toMatchObject({ canceled: 1 })
    expect((await billing.check({ customerId: "user_1", featureId: "pro_models" })).allowed).toBe(
      false,
    )
    expect(events.map(({ type }) => type)).toEqual(
      expect.arrayContaining(["subscription.past_due", "subscription.canceled"]),
    )
  })
})

describe("routing", () => {
  it("fails over to the next provider when one is down", async () => {
    const { billing } = await setup({
      providers: [fakeProvider("woovi", { failing: true }), fakeProvider("abacatepay")],
    })

    const result = await billing.subscribe({ customerId: "user_1", planId: "pro" })

    expect(await billing.getCharge({ chargeId: chargeIdOf(result) })).toMatchObject({
      provider: "abacatepay",
    })
  })

  it("rotates providers with round-robin", async () => {
    const { billing } = await setup({ routing: "round-robin" })
    await billing.upsertCustomer({ id: "user_2", name: "Bia" })

    const first = await billing.subscribe({ customerId: "user_1", planId: "pro" })
    const second = await billing.subscribe({ customerId: "user_2", planId: "pro" })

    const charges = await Promise.all(
      [first, second].map((result) => billing.getCharge({ chargeId: chargeIdOf(result) })),
    )
    expect(charges.map(({ provider }) => provider)).toEqual(["woovi", "abacatepay"])
  })

  it("lets a function pick the provider", async () => {
    const { billing } = await setup({
      routing: ({ amountInCents }) => (amountInCents > 10_000 ? "abacatepay" : "woovi"),
    })

    const result = await billing.subscribe({ customerId: "user_1", planId: "business" })

    expect(await billing.getCharge({ chargeId: chargeIdOf(result) })).toMatchObject({
      provider: "abacatepay",
    })
  })
})

describe("http handler", () => {
  it("subscribes the identified customer and settles the charge from a webhook", async () => {
    const { billing } = await setup()

    const subscribe = await billing.handler(
      new Request("http://localhost/api/dunas/subscribe", {
        method: "POST",
        headers: { "x-user": "user_9", "content-type": "application/json" },
        body: JSON.stringify({ planId: "pro" }),
      }),
    )
    const { next } = await subscribe.json()
    expect(subscribe.status).toBe(200)

    const charge = await billing.simulatePayment({ chargeId: next.chargeId })
    const webhook = await billing.handler(
      new Request("http://localhost/api/dunas/webhooks/woovi", {
        method: "POST",
        body: JSON.stringify({
          events: [{ type: "charge.updated", providerChargeId: charge.providerChargeId }],
        }),
      }),
    )
    expect(webhook.status).toBe(200)

    const customer = await billing.handler(
      new Request("http://localhost/api/dunas/customer", { headers: { "x-user": "user_9" } }),
    )
    expect(await customer.json()).toMatchObject({
      subscriptions: [{ planId: "pro", status: "active" }],
    })
  })

  it("rejects requests without a customer and unknown plans", async () => {
    const { billing } = await setup()

    const anonymous = await billing.handler(new Request("http://localhost/api/dunas/customer"))
    const unknownPlan = await billing.handler(
      new Request("http://localhost/api/dunas/subscribe", {
        method: "POST",
        headers: { "x-user": "user_1" },
        body: JSON.stringify({ planId: "enterprise" }),
      }),
    )

    expect(anonymous.status).toBe(401)
    expect(unknownPlan.status).toBe(404)
  })

  it("lists plans for the identified customer", async () => {
    const { billing } = await setup()

    const response = await billing.handler(
      new Request("http://localhost/api/dunas/plans", { headers: { "x-user": "user_1" } }),
    )

    expect(await response.json()).toContainEqual(
      expect.objectContaining({
        id: "pro",
        action: "upgrade",
        price: { amountInCents: 4_990, interval: "month" },
      }),
    )
  })

  it("accepts GET from Vercel Cron for renewals", async () => {
    const { billing } = await setup()

    const response = await billing.handler(
      new Request("http://localhost/api/dunas/renewals", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    )

    expect(response.status).toBe(200)
  })

  it("runs renewals only with the cron secret", async () => {
    const { billing } = await setup()

    const denied = await billing.handler(
      new Request("http://localhost/api/dunas/renewals", { method: "POST" }),
    )
    const allowed = await billing.handler(
      new Request("http://localhost/api/dunas/renewals", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret" },
      }),
    )

    expect(denied.status).toBe(401)
    expect(allowed.status).toBe(200)
  })

  it("reads the cron secret from CRON_SECRET when it is not passed", async () => {
    vi.stubEnv("CRON_SECRET", "env-secret")
    const billing = createDunas({
      database: pglite(new PGlite()),
      plans: [free],
      providers: [fakeProvider("woovi")],
    })
    await billing.migrate()

    const response = await billing.handler(
      new Request("http://localhost/api/dunas/renewals", {
        headers: { authorization: "Bearer env-secret" },
      }),
    )
    vi.unstubAllEnvs()

    expect(response.status).toBe(200)
  })
})
