import { existsSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { describe, expect, it } from "vitest"
import { abacatepay, createDunas, feature, pglite, plan, woovi } from "../../src/index.ts"
import type { CreatePixChargeInput, PaymentProvider } from "../../src/providers/provider.ts"

const envFile = new URL("../../../../.env.local", import.meta.url)
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

const { WOOVI_APP_ID, ABACATEPAY_API_KEY } = process.env

const providers: { name: string; create: () => PaymentProvider; isConfigured: boolean }[] = [
  {
    name: "woovi",
    create: () => woovi({ appId: WOOVI_APP_ID ?? "", sandbox: true, methods: ["pix_automatico"] }),
    isConfigured: Boolean(WOOVI_APP_ID),
  },
  {
    name: "abacatepay",
    create: () =>
      abacatepay({
        apiKey: ABACATEPAY_API_KEY ?? "",
        methods: ["card"],
        webhookSecret:
          process.env.ABACATEPAY_WEBHOOK_SECRET ?? "dunas-e2e-webhook-secret-0000000000",
      }),
    isConfigured: Boolean(ABACATEPAY_API_KEY),
  },
]

const messages = feature({ id: "messages", type: "metered" })
const free = plan({ id: "free", default: true, includes: [messages({ limit: 5 })] })
const pro = plan({
  id: "pro",
  price: { amountInCents: 500, interval: "month" },
  includes: [messages({ limit: 100 })],
})

function chargeInput(overrides: Partial<CreatePixChargeInput> = {}): CreatePixChargeInput {
  return {
    chargeId: `chg_e2e_${Date.now()}`,
    amountInCents: 150,
    description: "dunas e2e",
    expiresInSeconds: 3_600,
    payer: {
      name: "Ana Souza",
      email: "ana@example.com",
      taxId: "52998224725",
      phone: "5511999999999",
    },
    item: { id: "e2e", name: "dunas e2e" },
    checkout: "embedded",
    successUrl: "https://example.com/obrigado",
    ...overrides,
  }
}

for (const { name, create, isConfigured } of providers) {
  describe.skipIf(!isConfigured)(`${name} sandbox`, () => {
    it("creates an embedded Pix charge, simulates the payment and reads it back as paid", async () => {
      const provider = create()

      const charge = await provider.createPixCharge(chargeInput())
      const reference = {
        providerChargeId: charge.providerChargeId,
        method: "pix",
        checkout: "embedded",
      } as const

      expect(charge.status).toBe("pending")
      expect(charge.brCode).toMatch(/^000201/)
      expect(charge.expiresAt.getTime()).toBeGreaterThan(Date.now())
      expect(await provider.getChargeState(reference)).toEqual({ status: "pending", paidAt: null })

      await provider.simulatePayment?.(reference)

      expect(await provider.getChargeState(reference)).toMatchObject({ status: "paid" })
    })

    it("creates a hosted Pix checkout with a payment page", async () => {
      const provider = create()

      const charge = await provider.createPixCharge(chargeInput({ checkout: "hosted" }))

      expect(charge.status).toBe("pending")
      expect(charge.paymentUrl).toMatch(/^https:\/\//)
      expect(
        await provider.getChargeState({
          providerChargeId: charge.providerChargeId,
          method: "pix",
          checkout: "hosted",
        }),
      ).toEqual({ status: "pending", paidAt: null })
    })

    it("runs the whole subscribe flow against the real gateway", async () => {
      const billing = createDunas({
        database: pglite(new PGlite()),
        plans: [free, pro],
        providers: [create()],
      })
      const customerId = `user_${Date.now()}`
      await billing.migrate()
      await billing.upsertCustomer({
        id: customerId,
        name: "Ana Souza",
        email: "ana@example.com",
        taxId: "529.982.247-25",
        phone: "(11) 99999-9999",
      })

      const { next } = await billing.subscribe({
        customerId,
        planId: "pro",
        method: "pix",
        checkout: "embedded",
      })
      if (next.type === "none") {
        throw new Error("expected a Pix to pay")
      }
      expect(next.brCode).toMatch(/^000201/)

      const paid = await billing.simulatePayment({ chargeId: next.chargeId })

      expect(paid).toMatchObject({ provider: name, amountInCents: 500, status: "paid" })
      expect(
        (await billing.check({ customerId, featureId: "messages", required: 50 })).allowed,
      ).toBe(true)
    })
  })
}

describe.skipIf(!WOOVI_APP_ID)("woovi Pix Automático sandbox", () => {
  it("creates a Pix Automático authorization, reads it back and cancels it", async () => {
    const provider = woovi({
      appId: WOOVI_APP_ID ?? "",
      sandbox: true,
      methods: ["pix_automatico"],
    })

    const subscription = await provider.createSubscription?.({
      ...chargeInput({ amountInCents: 500 }),
      method: "pix_automatico",
      interval: "month",
    })
    if (!subscription) {
      throw new Error("woovi should create subscriptions")
    }

    expect(subscription.providerSubscriptionId).toBe(subscription.providerChargeId)
    expect(subscription.brCode).toBeTruthy()
    expect(subscription.paymentUrl).toMatch(/^https:\/\/woovi-sandbox\.com\/pay\//)
    expect(
      await provider.getChargeState({
        providerChargeId: subscription.providerChargeId,
        method: "pix_automatico",
        checkout: "embedded",
      }),
    ).toEqual({ status: "pending", paidAt: null })

    await provider.cancelSubscription?.(subscription.providerSubscriptionId)
  })
})

describe.skipIf(!ABACATEPAY_API_KEY)("abacatepay card subscription dev mode", () => {
  it("creates a hosted card subscription checkout, reads it back and deletes it", async () => {
    const provider = abacatepay({
      apiKey: ABACATEPAY_API_KEY ?? "",
      webhookSecret: process.env.ABACATEPAY_WEBHOOK_SECRET ?? "dunas-e2e-webhook-secret-0000000000",
      methods: ["card"],
    })

    const subscription = await provider.createSubscription?.({
      ...chargeInput({ amountInCents: 500, checkout: "hosted" }),
      method: "card",
      interval: "month",
    })
    if (!subscription) {
      throw new Error("abacatepay should create subscriptions")
    }

    expect(subscription.providerSubscriptionId).toMatch(/^bill_/)
    expect(subscription.paymentUrl).toMatch(/^https:\/\/app\.abacatepay\.com\/pay\/bill_/)
    expect(
      await provider.getChargeState({
        providerChargeId: subscription.providerChargeId,
        method: "card",
        checkout: "hosted",
      }),
    ).toEqual({ status: "pending", paidAt: null })

    await provider.cancelSubscription?.(subscription.providerSubscriptionId)
  })
})
