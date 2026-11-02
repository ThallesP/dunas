import { createHmac } from "node:crypto"
import type { BillingInterval } from "../../catalog/plan.ts"
import { safeEqual } from "../../lib/safe-equal.ts"
import {
  type ChargeReference,
  type ChargeStatus,
  type Checkout,
  type CreatePixChargeInput,
  InvalidWebhookError,
  type PaymentProvider,
  type PixPayer,
  ProviderError,
  type ProviderEvent,
  requestJson,
} from "../provider.ts"

type AbacatePayCapabilities = { pix: Checkout; pix_automatico: "hosted"; card: "hosted" }

type AbacatePayMethod = keyof AbacatePayCapabilities

export type AbacatePayOptions<TMethod extends AbacatePayMethod = AbacatePayMethod> = {
  apiKey: string
  webhookSecret: string
  methods?: readonly TMethod[]
}

type AbacatePayResponse<TData> = {
  data: TData
  error: string | null
}

type AbacatePayStatus =
  | "PENDING"
  | "PAID"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED"
  | "UNDER_DISPUTE"
  | "ACTIVE"
  | "REDEEMED"

type AbacatePayPixCharge = {
  id: string
  status: AbacatePayStatus
  brCode: string
  brCodeBase64?: string
  expiresAt: string
  devMode: boolean
}

type AbacatePayCheckout = {
  id: string
  url: string
  status: AbacatePayStatus
}

type AbacatePayWebhookBody = {
  event?: string
  type?: string
  data?: {
    transparent?: { id?: string }
    checkout?: { id?: string }
    subscription?: { id?: string; amount?: number; cancelledDueTo?: string | null }
    payment?: { id?: string; amount?: number; paidAmount?: number | null; updatedAt?: string }
  }
}

const chargeStatus: Record<AbacatePayStatus, ChargeStatus> = {
  PENDING: "pending",
  ACTIVE: "pending",
  PAID: "paid",
  REDEEMED: "paid",
  UNDER_DISPUTE: "paid",
  EXPIRED: "expired",
  CANCELLED: "canceled",
  REFUNDED: "refunded",
}

const cycle: Record<BillingInterval, string> = {
  week: "WEEKLY",
  month: "MONTHLY",
  year: "ANNUALLY",
}

const checkouts: { [TMethod in AbacatePayMethod]: readonly AbacatePayCapabilities[TMethod][] } = {
  pix: ["hosted", "embedded"],
  pix_automatico: ["hosted"],
  card: ["hosted"],
}

const webhookEvents: Record<string, (data: AbacatePayWebhookBody["data"]) => ProviderEvent[]> = {
  "transparent.completed": transparentUpdated,
  "transparent.refunded": transparentUpdated,
  "transparent.disputed": transparentUpdated,
  "checkout.completed": checkoutUpdated,
  "checkout.refunded": checkoutUpdated,
  "checkout.disputed": checkoutUpdated,
  "subscription.completed": (data) => subscriptionPaid(data, { isFirstPayment: true }),
  "subscription.renewed": (data) => subscriptionPaid(data, { isFirstPayment: false }),
  "subscription.cancelled": (data) => {
    const subscription = data?.subscription
    if (!subscription?.id) {
      return []
    }
    const isFailure = subscription.cancelledDueTo === "max_payment_retries_exceeded"
    return [
      {
        type: "subscription.ended",
        providerSubscriptionId: subscription.id,
        reason: isFailure ? "failed" : "revoked",
      },
    ]
  },
}

const pixEvents = [
  "transparent.completed",
  "transparent.refunded",
  "transparent.disputed",
  "checkout.completed",
  "checkout.refunded",
  "checkout.disputed",
]

const subscriptionEvents = [
  "subscription.completed",
  "subscription.renewed",
  "subscription.cancelled",
]

const signingKey =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9"

export function abacatepay<const TMethod extends AbacatePayMethod = "pix">({
  apiKey,
  webhookSecret,
  methods = [],
}: AbacatePayOptions<TMethod>): PaymentProvider<
  "abacatepay",
  Pick<AbacatePayCapabilities, "pix" | NoInfer<TMethod>>
> {
  if (webhookSecret.length < 32) {
    throw new Error("AbacatePay webhookSecret must have at least 32 characters")
  }

  const enabledMethods = [...new Set<"pix" | TMethod>(["pix", ...methods])]
  const knownProducts = new Set<string>()

  async function request<TData>(
    path: string,
    init: { method?: "GET" | "POST"; body?: unknown } = {},
  ) {
    const { data } = await requestJson<AbacatePayResponse<TData>>({
      provider: "abacatepay",
      url: `https://api.abacatepay.com/v2${path}`,
      headers: { authorization: `Bearer ${apiKey}` },
      readError: readAbacatePayError,
      ...init,
    })
    return data
  }

  async function ensureProduct(product: {
    externalId: string
    name: string
    price: number
    cycle: string | null
  }) {
    if (knownProducts.has(product.externalId)) {
      return product.externalId
    }

    await request("/products/create", {
      method: "POST",
      body: { ...product, currency: "BRL" },
    }).catch((error: unknown) => {
      const isDuplicate =
        error instanceof ProviderError &&
        error.status === 400 &&
        /already exists/i.test(error.message)
      if (!isDuplicate) {
        throw error
      }
    })

    knownProducts.add(product.externalId)
    return product.externalId
  }

  async function createHostedPix({
    chargeId,
    amountInCents,
    expiresInSeconds,
    item,
    successUrl,
  }: CreatePixChargeInput) {
    const productId = await ensureProduct({
      externalId: `dunas_${item.id}_${amountInCents}`,
      name: item.name,
      price: amountInCents,
      cycle: null,
    })
    const checkout = await request<AbacatePayCheckout>("/checkouts/create", {
      method: "POST",
      body: {
        items: [{ id: productId, quantity: 1 }],
        methods: ["PIX"],
        externalId: chargeId,
        returnUrl: successUrl ?? undefined,
        completionUrl: successUrl ?? undefined,
        metadata: { dunasChargeId: chargeId },
      },
    })

    return {
      providerChargeId: checkout.id,
      status: chargeStatus[checkout.status],
      brCode: null,
      qrCodeImageUrl: null,
      paymentUrl: checkout.url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
    }
  }

  async function createEmbeddedPix({
    chargeId,
    amountInCents,
    description,
    expiresInSeconds,
    payer,
  }: CreatePixChargeInput) {
    const charge = await request<AbacatePayPixCharge>("/transparents/create", {
      method: "POST",
      body: {
        method: "PIX",
        data: {
          amount: amountInCents,
          description: description.slice(0, 140),
          expiresIn: expiresInSeconds,
          externalId: chargeId,
          customer: toAbacatePayCustomer(payer),
          metadata: { dunasChargeId: chargeId },
        },
      },
    })

    return {
      providerChargeId: charge.id,
      status: chargeStatus[charge.status],
      brCode: charge.brCode,
      qrCodeImageUrl: charge.brCodeBase64 ?? null,
      paymentUrl: null,
      expiresAt: new Date(charge.expiresAt),
    }
  }

  return {
    id: "abacatepay",
    methods: enabledMethods,
    checkouts,

    createPixCharge(input) {
      return input.checkout === "hosted" ? createHostedPix(input) : createEmbeddedPix(input)
    },

    async createSubscription({
      chargeId,
      amountInCents,
      expiresInSeconds,
      item,
      successUrl,
      method,
      interval,
    }) {
      const productId = await ensureProduct({
        externalId: `dunas_${item.id}_${amountInCents}_${interval}`,
        name: item.name,
        price: amountInCents,
        cycle: cycle[interval],
      })
      const checkout = await request<AbacatePayCheckout>("/subscriptions/create", {
        method: "POST",
        body: {
          items: [{ id: productId, quantity: 1 }],
          methods: [method === "card" ? "CARD" : "PIX"],
          externalId: chargeId,
          returnUrl: successUrl ?? undefined,
          completionUrl: successUrl ?? undefined,
          metadata: { dunasChargeId: chargeId },
        },
      })

      return {
        providerChargeId: checkout.id,
        providerSubscriptionId: checkout.id,
        status: chargeStatus[checkout.status],
        brCode: null,
        qrCodeImageUrl: null,
        paymentUrl: checkout.url,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
      }
    },

    async cancelSubscription(providerSubscriptionId) {
      const id = encodeURIComponent(providerSubscriptionId)
      if (providerSubscriptionId.startsWith("bill_")) {
        await request(`/subscriptions/checkouts/delete?id=${id}`, { method: "POST" })
        return
      }

      await request("/subscriptions/cancel", {
        method: "POST",
        body: { id: providerSubscriptionId },
      })
    },

    async getChargeState(charge) {
      const { status } = await request<{ status: AbacatePayStatus }>(statusPath(charge))
      return { status: chargeStatus[status], paidAt: null }
    },

    async parseWebhook({ url, headers, body }) {
      const receivedSecret =
        url.searchParams.get("webhookSecret") ?? headers.get("x-webhook-secret") ?? ""
      if (!safeEqual(receivedSecret, webhookSecret)) {
        throw new InvalidWebhookError("AbacatePay webhookSecret does not match")
      }

      const signature = headers.get("x-webhook-signature")
      const expectedSignature = createHmac("sha256", signingKey).update(body).digest("base64")
      if (signature && !safeEqual(signature, expectedSignature)) {
        throw new InvalidWebhookError("AbacatePay webhook signature is invalid")
      }

      const { event, type, data } = JSON.parse(body) as AbacatePayWebhookBody
      const eventName = event ?? type
      const toEvents = eventName ? webhookEvents[eventName] : undefined
      return toEvents ? toEvents(data) : []
    },

    async registerWebhook({ url }) {
      const webhooks = await request<{ endpoint: string }[]>("/webhooks/list")
      if (webhooks.some(({ endpoint }) => endpoint === url)) {
        return
      }

      const hasSubscriptions = enabledMethods.some((method) => method !== "pix")
      await request("/webhooks/create", {
        method: "POST",
        body: {
          name: "dunas",
          endpoint: url,
          secret: webhookSecret,
          events: hasSubscriptions ? [...pixEvents, ...subscriptionEvents] : pixEvents,
        },
      })
    },

    async simulatePayment({ providerChargeId, method, checkout }) {
      if (method !== "pix" || checkout !== "embedded") {
        throw new Error("AbacatePay only simulates embedded Pix charges")
      }

      await request(`/transparents/simulate-payment?id=${encodeURIComponent(providerChargeId)}`, {
        method: "POST",
      })
    },
  }
}

function statusPath({ providerChargeId, method, checkout }: ChargeReference) {
  const id = encodeURIComponent(providerChargeId)
  if (method !== "pix") {
    return `/subscriptions/checkouts/get?id=${id}`
  }

  if (checkout === "hosted") {
    return `/checkouts/get?id=${id}`
  }

  return `/transparents/check?id=${id}`
}

function transparentUpdated(data: AbacatePayWebhookBody["data"]): ProviderEvent[] {
  const providerChargeId = data?.transparent?.id
  return providerChargeId ? [{ type: "charge.updated", providerChargeId }] : []
}

function checkoutUpdated(data: AbacatePayWebhookBody["data"]): ProviderEvent[] {
  const providerChargeId = data?.checkout?.id
  return providerChargeId ? [{ type: "charge.updated", providerChargeId }] : []
}

function subscriptionPaid(
  data: AbacatePayWebhookBody["data"],
  { isFirstPayment }: { isFirstPayment: boolean },
): ProviderEvent[] {
  const subscription = data?.subscription
  const payment = data?.payment
  const amountInCents = payment?.paidAmount ?? payment?.amount ?? subscription?.amount
  if (!subscription?.id || !payment?.id || !amountInCents) {
    return []
  }

  return [
    {
      type: "subscription.paid",
      providerSubscriptionId: subscription.id,
      checkoutId: data?.checkout?.id ?? null,
      providerPaymentId: payment.id,
      isFirstPayment,
      amountInCents,
      paidAt: payment.updatedAt ? new Date(payment.updatedAt) : null,
    },
  ]
}

function toAbacatePayCustomer({ name, email, taxId, phone }: PixPayer) {
  if (!name || !email || !taxId || !phone) {
    return undefined
  }

  return { name, email, taxId, cellphone: `+${phone}` }
}

function readAbacatePayError(body: unknown) {
  if (typeof body !== "object" || body === null) {
    return null
  }

  const { error } = body as { error?: unknown }
  return typeof error === "string" ? error : null
}
