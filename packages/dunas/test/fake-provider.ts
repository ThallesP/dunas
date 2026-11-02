import {
  type ChargeStatus,
  type PaymentMethod,
  type PaymentProvider,
  ProviderError,
} from "../src/providers/provider.ts"

export function fakeProvider<const TId extends string>(
  id: TId,
  {
    failing = false,
    methods = ["pix"],
    rejects = [],
  }: { failing?: boolean; methods?: PaymentMethod[]; rejects?: PaymentMethod[] } = {},
) {
  const charges = new Map<
    string,
    { status: ChargeStatus; paidAt: Date | null; amountInCents: number }
  >()
  const created: string[] = []
  const canceled: string[] = []

  function open({
    providerChargeId,
    amountInCents,
    expiresInSeconds,
    method,
  }: {
    providerChargeId: string
    amountInCents: number
    expiresInSeconds: number
    method: PaymentMethod
  }) {
    if (failing || rejects.includes(method)) {
      throw new ProviderError({ provider: id, status: 503, message: "unavailable" })
    }
    charges.set(providerChargeId, { status: "pending", paidAt: null, amountInCents })
    created.push(providerChargeId)
    return {
      providerChargeId,
      status: "pending" as const,
      brCode: `00020126${providerChargeId}`,
      qrCodeImageUrl: null,
      paymentUrl: `https://pay.example.com/${providerChargeId}`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
    }
  }

  const provider: PaymentProvider<TId> = {
    id,
    methods,
    checkouts: {
      pix: ["hosted", "embedded"],
      pix_automatico: ["hosted", "embedded"],
      card: ["hosted"],
    },
    async createPixCharge({ chargeId, amountInCents, expiresInSeconds }) {
      return open({
        providerChargeId: `${id}_${chargeId}`,
        amountInCents,
        expiresInSeconds,
        method: "pix",
      })
    },
    async createSubscription({ chargeId, amountInCents, expiresInSeconds, method }) {
      const providerSubscriptionId = `${id}_sub_${chargeId}`
      const charge = open({
        providerChargeId: providerSubscriptionId,
        amountInCents,
        expiresInSeconds,
        method,
      })
      return { ...charge, providerSubscriptionId }
    },
    async cancelSubscription(providerSubscriptionId) {
      canceled.push(providerSubscriptionId)
    },
    async getChargeState({ providerChargeId }) {
      const charge = charges.get(providerChargeId)
      if (!charge) {
        throw new ProviderError({ provider: id, status: 404, message: "not found" })
      }
      return { status: charge.status, paidAt: charge.paidAt }
    },
    async parseWebhook({ body }) {
      return JSON.parse(body).events
    },
    async registerWebhook() {},
    async simulatePayment({ providerChargeId }) {
      const charge = charges.get(providerChargeId)
      if (charge) {
        charges.set(providerChargeId, { ...charge, status: "paid" })
      }
    },
  }

  return Object.assign(provider, { created, canceled })
}
