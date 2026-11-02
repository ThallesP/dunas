import { describe, expect, it } from "vitest"
import type { ProviderEvent } from "../src/providers/provider.ts"
import { fakeProvider } from "./fake-provider.ts"
import { chargeIdOf, setup } from "./setup.ts"

type Billing = Awaited<ReturnType<typeof setup>>["billing"]

function deliver(billing: Billing, providerId: string, events: ProviderEvent[]) {
  return billing.handler(
    new Request(`http://localhost/api/dunas/webhooks/${providerId}`, {
      method: "POST",
      body: JSON.stringify({ events }),
    }),
  )
}

function automatic() {
  return fakeProvider("woovi", { methods: ["pix", "pix_automatico"] })
}

async function activeAutomaticPro() {
  const provider = automatic()
  const context = await setup({ providers: [provider] })
  const result = await context.billing.subscribe({ customerId: "user_1", planId: "pro" })
  await context.billing.simulatePayment({ chargeId: chargeIdOf(result) })
  const [providerSubscriptionId = ""] = provider.created
  return { ...context, provider, providerSubscriptionId }
}

async function currentSubscription(billing: Billing) {
  const [subscription] = (await billing.getCustomer({ customerId: "user_1" })).subscriptions
  return subscription
}

describe("choosing how to pay", () => {
  it("defaults to a hosted Pix page when no provider has Pix Automático", async () => {
    const { billing } = await setup()

    const { subscription, next } = await billing.subscribe({ customerId: "user_1", planId: "pro" })

    expect(subscription).toMatchObject({ method: "pix", checkout: "hosted", status: "pending" })
    expect(next).toMatchObject({ type: "redirect", url: expect.stringMatching(/^https:\/\//) })
  })

  it("returns the Pix code itself with an embedded checkout", async () => {
    const { billing } = await setup()

    const { next } = await billing.subscribe({
      customerId: "user_1",
      planId: "pro",
      method: "pix",
      checkout: "embedded",
    })

    expect(next).toMatchObject({ type: "pix", brCode: expect.stringMatching(/^000201/) })
  })

  it("prefers Pix Automático when a provider offers it", async () => {
    const { billing } = await setup({ providers: [automatic()] })

    const { subscription } = await billing.subscribe({ customerId: "user_1", planId: "pro" })

    expect(subscription).toMatchObject({
      method: "pix_automatico",
      provider: "woovi",
      providerSubscriptionId: expect.stringContaining("woovi_sub_"),
    })
  })

  it("falls back to Pix when Pix Automático fails and the method was not asked for", async () => {
    const { billing } = await setup({
      providers: [
        fakeProvider("woovi", { methods: ["pix", "pix_automatico"], rejects: ["pix_automatico"] }),
      ],
    })

    const result = await billing.subscribe({ customerId: "user_1", planId: "pro" })

    expect(result.subscription).toMatchObject({ method: "pix" })
    expect(
      (await billing.getCustomer({ customerId: "user_1" })).subscriptions.map(
        ({ method }) => method,
      ),
    ).toEqual(["pix"])
  })

  it("does not fall back when the method was asked for", async () => {
    const { billing } = await setup({
      providers: [
        fakeProvider("woovi", { methods: ["pix", "pix_automatico"], rejects: ["pix_automatico"] }),
      ],
    })

    await expect(
      billing.subscribe({ customerId: "user_1", planId: "pro", method: "pix_automatico" }),
    ).rejects.toMatchObject({ code: "ALL_PROVIDERS_FAILED" })
    expect((await billing.getCustomer({ customerId: "user_1" })).subscriptions).toEqual([])
  })

  it("routes a method only to providers that offer it", async () => {
    const { billing } = await setup({
      providers: [fakeProvider("woovi"), fakeProvider("abacatepay", { methods: ["pix", "card"] })],
    })

    const result = await billing.subscribe({ customerId: "user_1", planId: "pro", method: "card" })

    expect(await billing.getCharge({ chargeId: chargeIdOf(result) })).toMatchObject({
      provider: "abacatepay",
      method: "card",
    })
  })

  it("answers 400 over HTTP for a method no provider offers", async () => {
    const { billing } = await setup()

    const response = await billing.handler(
      new Request("http://localhost/api/dunas/subscribe", {
        method: "POST",
        headers: { "x-user": "user_1" },
        body: JSON.stringify({ planId: "pro", method: "pix_automatico" }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "METHOD_NOT_AVAILABLE" } })
  })

  it("starts a new payment when the customer switches method before paying", async () => {
    const { billing } = await setup({ providers: [automatic()] })

    const first = await billing.subscribe({ customerId: "user_1", planId: "pro" })
    const second = await billing.subscribe({ customerId: "user_1", planId: "pro", method: "pix" })

    expect(chargeIdOf(second)).not.toBe(chargeIdOf(first))
    expect(
      (await billing.getCustomer({ customerId: "user_1" })).subscriptions.map(
        ({ method }) => method,
      ),
    ).toEqual(["pix"])
  })
})

describe("payments the provider collects", () => {
  it("activates on the first payment and leaves renewals to the provider", async () => {
    const { billing, advance, events } = await activeAutomaticPro()

    expect(await currentSubscription(billing)).toMatchObject({
      status: "active",
      currentPeriodEnd: new Date("2026-02-28T12:00:00Z"),
    })

    advance(29)
    expect(await billing.runRenewals()).toMatchObject({ pastDue: 0, chargesCreated: 0 })
    expect(events.filter(({ type }) => type === "charge.created")).toHaveLength(1)
  })

  it("extends the period once per debit the provider reports", async () => {
    const { billing, advance, events, providerSubscriptionId } = await activeAutomaticPro()
    const debit: ProviderEvent = {
      type: "subscription.paid",
      providerSubscriptionId,
      checkoutId: null,
      providerPaymentId: "debit_2",
      isFirstPayment: false,
      amountInCents: 4_990,
      paidAt: null,
    }

    advance(28)
    await deliver(billing, "woovi", [debit])
    await deliver(billing, "woovi", [debit])

    expect(await currentSubscription(billing)).toMatchObject({
      currentPeriodStart: new Date("2026-02-28T12:00:00Z"),
      currentPeriodEnd: new Date("2026-03-28T12:00:00Z"),
    })
    expect(events.filter(({ type }) => type === "subscription.renewed")).toHaveLength(1)
    expect(events.filter(({ type }) => type === "charge.created")).toHaveLength(1)
  })

  it("links the provider's subscription id when the first payment names the checkout", async () => {
    const provider = fakeProvider("abacatepay", { methods: ["pix", "card"] })
    const { billing } = await setup({ providers: [provider] })
    await billing.subscribe({ customerId: "user_1", planId: "pro", method: "card" })
    const [checkoutId = ""] = provider.created

    await deliver(billing, "abacatepay", [
      {
        type: "subscription.paid",
        providerSubscriptionId: "subs_1",
        checkoutId,
        providerPaymentId: "char_1",
        isFirstPayment: true,
        amountInCents: 4_990,
        paidAt: null,
      },
    ])

    expect(await currentSubscription(billing)).toMatchObject({
      status: "active",
      providerSubscriptionId: "subs_1",
    })
  })

  it("switches to Pix renewals when the customer revokes Pix Automático", async () => {
    const { billing, advance, providerSubscriptionId } = await activeAutomaticPro()
    const changes: string[] = []
    billing.on("subscription.method_changed", ({ subscription, previousMethod }) => {
      changes.push(`${previousMethod} -> ${subscription.method}`)
    })

    await deliver(billing, "woovi", [
      { type: "subscription.ended", providerSubscriptionId, reason: "revoked" },
    ])
    advance(26)

    expect(changes).toEqual(["pix_automatico -> pix"])
    expect(await billing.runRenewals()).toMatchObject({ chargesCreated: 1 })
  })

  it("cancels the provider side before charging by Pix when a debit fails", async () => {
    const { billing, provider, providerSubscriptionId } = await activeAutomaticPro()

    await deliver(billing, "woovi", [
      { type: "subscription.ended", providerSubscriptionId, reason: "failed" },
    ])

    expect(provider.canceled).toEqual([providerSubscriptionId])
    expect(await currentSubscription(billing)).toMatchObject({
      method: "pix",
      providerSubscriptionId: null,
    })
  })

  it("cancels at the provider right away when the customer cancels at period end", async () => {
    const { billing, provider, providerSubscriptionId } = await activeAutomaticPro()

    await billing.cancel({ customerId: "user_1", planId: "pro" })
    await deliver(billing, "woovi", [
      { type: "subscription.ended", providerSubscriptionId, reason: "revoked" },
    ])

    expect(provider.canceled).toEqual([providerSubscriptionId])
    expect(await currentSubscription(billing)).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: true,
      method: "pix_automatico",
    })
  })

  it("cancels the old provider subscription once an upgrade is paid", async () => {
    const { billing, provider, providerSubscriptionId } = await activeAutomaticPro()

    const upgrade = await billing.subscribe({ customerId: "user_1", planId: "business" })
    await billing.simulatePayment({ chargeId: chargeIdOf(upgrade) })

    expect(provider.canceled).toEqual([providerSubscriptionId])
  })
})

describe("late payments", () => {
  it("still counts a payment that arrives after dunas expired the charge", async () => {
    const provider = fakeProvider("woovi")
    const { billing, clock } = await setup({ providers: [provider] })
    const result = await billing.subscribe({ customerId: "user_1", planId: "pro" })
    const chargeId = chargeIdOf(result)
    clock.now = new Date(Date.now() + 2 * 86_400_000)

    expect(await billing.syncCharge({ chargeId })).toMatchObject({ status: "expired" })

    const paid = await billing.simulatePayment({ chargeId })

    expect(paid.status).toBe("paid")
    expect(await currentSubscription(billing)).toMatchObject({ status: "active" })
  })
})
