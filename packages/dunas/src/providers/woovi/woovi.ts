import { createVerify } from "node:crypto"
import type { BillingInterval } from "../../catalog/plan.ts"
import { required } from "../../lib/required.ts"
import { safeEqual } from "../../lib/safe-equal.ts"
import {
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

type WooviCapabilities = { pix: Checkout; pix_automatico: Checkout }

type WooviMethod = keyof WooviCapabilities

export type WooviOptions<TMethod extends WooviMethod = WooviMethod> = {
  appId: string | undefined
  sandbox?: boolean
  webhookAuthorization?: string
  methods?: readonly TMethod[]
}

type WooviCharge = {
  correlationID: string
  status: "ACTIVE" | "COMPLETED" | "EXPIRED"
  brCode: string
  qrCodeImage?: string
  paymentLinkUrl?: string
  expiresDate: string
  transactionID: string
  paidAt?: string
  updatedAt: string
}

type WooviMandateStatus = "CREATED" | "APPROVED" | "EXPIRED" | "REJECTED" | "CANCELED"

type WooviSubscription = {
  globalID: string
  paymentLinkUrl?: string
  pixRecurring: {
    emv: string
    paymentLinkID: string
    status?: WooviMandateStatus
  }
}

type WooviWebhookBody = {
  event?: string
  charge?: { correlationID?: string } | null
  globalID?: string
  value?: number
  paymentSubscriptionGlobalID?: string
  installmentNumber?: number
  cobr?: { tries?: { tryStatus?: string; updatedAt?: string }[] }
}

const chargeStatus: Record<WooviCharge["status"], ChargeStatus> = {
  ACTIVE: "pending",
  COMPLETED: "paid",
  EXPIRED: "expired",
}

const mandateStatus: Record<WooviMandateStatus, ChargeStatus> = {
  CREATED: "pending",
  APPROVED: "paid",
  EXPIRED: "expired",
  REJECTED: "canceled",
  CANCELED: "canceled",
}

const frequency: Record<BillingInterval, string> = {
  week: "WEEKLY",
  month: "MONTHLY",
  year: "ANNUALLY",
}

const checkouts: { [TMethod in WooviMethod]: readonly Checkout[] } = {
  pix: ["hosted", "embedded"],
  pix_automatico: ["hosted", "embedded"],
}

const webhookEvents: Record<string, (body: WooviWebhookBody) => ProviderEvent[]> = {
  "OPENPIX:CHARGE_COMPLETED": chargeUpdated,
  "OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER": chargeUpdated,
  "OPENPIX:CHARGE_EXPIRED": chargeUpdated,
  PIX_AUTOMATIC_APPROVED: ({ globalID, value }) =>
    globalID && value
      ? [
          {
            type: "subscription.paid",
            providerSubscriptionId: globalID,
            checkoutId: null,
            providerPaymentId: `${globalID}#1`,
            isFirstPayment: true,
            amountInCents: value,
            paidAt: null,
          },
        ]
      : [],
  PIX_AUTOMATIC_REJECTED: ({ globalID }) =>
    globalID
      ? [{ type: "subscription.ended", providerSubscriptionId: globalID, reason: "revoked" }]
      : [],
  PIX_AUTOMATIC_COBR_COMPLETED: ({
    paymentSubscriptionGlobalID,
    installmentNumber,
    value,
    cobr,
  }) => {
    if (!paymentSubscriptionGlobalID || !installmentNumber || !value) {
      return []
    }
    const paidTry = cobr?.tries?.find(({ tryStatus }) => tryStatus === "PAID")
    return [
      {
        type: "subscription.paid",
        providerSubscriptionId: paymentSubscriptionGlobalID,
        checkoutId: null,
        providerPaymentId: `${paymentSubscriptionGlobalID}#${installmentNumber}`,
        isFirstPayment: installmentNumber === 1,
        amountInCents: value,
        paidAt: paidTry?.updatedAt ? new Date(paidTry.updatedAt) : null,
      },
    ]
  },
  PIX_AUTOMATIC_COBR_REJECTED: ({ paymentSubscriptionGlobalID }) =>
    paymentSubscriptionGlobalID
      ? [
          {
            type: "subscription.ended",
            providerSubscriptionId: paymentSubscriptionGlobalID,
            reason: "failed",
          },
        ]
      : [],
}

const chargeEvents = [
  "OPENPIX:CHARGE_COMPLETED",
  "OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER",
  "OPENPIX:CHARGE_EXPIRED",
]

const pixAutomaticoEvents = [
  "PIX_AUTOMATIC_APPROVED",
  "PIX_AUTOMATIC_REJECTED",
  "PIX_AUTOMATIC_COBR_COMPLETED",
  "PIX_AUTOMATIC_COBR_REJECTED",
]

export function woovi<const TMethod extends WooviMethod = "pix">({
  appId: appIdOption,
  sandbox = false,
  webhookAuthorization,
  methods = [],
}: WooviOptions<TMethod>): PaymentProvider<
  "woovi",
  Pick<WooviCapabilities, "pix" | NoInfer<TMethod>>
> {
  const appId = required(appIdOption, "Woovi appId is missing. Set WOOVI_APP_ID.")
  const baseUrl = sandbox ? "https://api.woovi-sandbox.com" : "https://api.woovi.com"
  const payUrl = sandbox ? "https://woovi-sandbox.com/pay" : "https://woovi.com/pay"
  const enabledMethods = [...new Set<"pix" | TMethod>(["pix", ...methods])]
  let publicKeys: Promise<string[]> | null = null

  function request<TResponse>(
    path: string,
    init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {},
  ) {
    return requestJson<TResponse>({
      provider: "woovi",
      url: `${baseUrl}${path}`,
      headers: { authorization: appId },
      readError: readWooviError,
      ...init,
    })
  }

  function loadPublicKeys() {
    publicKeys ??= request<{ public_keys: { key: string }[] }>("/api/v1/webhook/public-keys")
      .then(({ public_keys }) => public_keys.map(({ key }) => key))
      .catch((error: unknown) => {
        publicKeys = null
        throw error
      })
    return publicKeys
  }

  async function getCharge(correlationID: string) {
    const { charge } = await request<{ charge: WooviCharge }>(
      `/api/v1/charge/${encodeURIComponent(correlationID)}`,
    )
    return charge
  }

  async function getSubscription(globalID: string) {
    const { subscription } = await request<{ subscription: WooviSubscription }>(
      `/api/v1/subscriptions/${encodeURIComponent(globalID)}`,
    )
    return subscription
  }

  return {
    id: "woovi",
    methods: enabledMethods,
    checkouts,

    async createPixCharge({
      chargeId,
      amountInCents,
      description,
      expiresInSeconds,
      payer,
    }: CreatePixChargeInput) {
      const { charge } = await request<{ charge: WooviCharge }>(
        "/api/v1/charge?return_existing=true",
        {
          method: "POST",
          body: {
            correlationID: chargeId,
            value: amountInCents,
            comment: description,
            expiresIn: Math.max(300, expiresInSeconds),
            customer: toWooviCustomer(payer),
            additionalInfo: [{ key: "dunas_charge_id", value: chargeId }],
          },
        },
      )

      return {
        providerChargeId: charge.correlationID,
        status: chargeStatus[charge.status],
        brCode: charge.brCode,
        qrCodeImageUrl: charge.qrCodeImage ?? null,
        paymentUrl: charge.paymentLinkUrl ?? null,
        expiresAt: new Date(charge.expiresDate),
      }
    },

    async createSubscription({
      chargeId,
      amountInCents,
      description,
      expiresInSeconds,
      payer,
      item,
      interval,
    }) {
      const customer = toWooviCustomer(payer)
      if (!customer?.taxID) {
        throw new ProviderError({
          provider: "woovi",
          status: null,
          message: "Pix Automático needs the customer's name and CPF/CNPJ",
        })
      }

      const { subscription } = await request<{ subscription: WooviSubscription }>(
        "/api/v1/subscriptions",
        {
          method: "POST",
          body: {
            name: item.name,
            value: amountInCents,
            correlationID: chargeId,
            comment: description.slice(0, 29),
            type: "PIX_RECURRING",
            frequency: frequency[interval],
            dayGenerateCharge: new Date().toISOString(),
            customer,
            pixRecurringOptions: { journey: "PAYMENT_ON_APPROVAL", retryPolicy: "NON_PERMITED" },
          },
        },
      )

      return {
        providerChargeId: subscription.globalID,
        providerSubscriptionId: subscription.globalID,
        status: "pending",
        brCode: subscription.pixRecurring.emv,
        qrCodeImageUrl: null,
        paymentUrl:
          subscription.paymentLinkUrl ?? `${payUrl}/${subscription.pixRecurring.paymentLinkID}`,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
      }
    },

    async cancelSubscription(providerSubscriptionId) {
      await request(`/api/v1/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, {
        method: "PUT",
      })
    },

    async getChargeState({ providerChargeId, method }) {
      if (method === "pix_automatico") {
        const { pixRecurring } = await getSubscription(providerChargeId)
        const status = pixRecurring.status ? mandateStatus[pixRecurring.status] : "pending"
        return { status, paidAt: null }
      }

      const charge = await getCharge(providerChargeId)
      const status = chargeStatus[charge.status]
      const paidAt = status === "paid" ? new Date(charge.paidAt ?? charge.updatedAt) : null
      return { status, paidAt }
    },

    async parseWebhook({ headers, body }) {
      const parsed = JSON.parse(body) as WooviWebhookBody
      const toEvents = parsed.event ? webhookEvents[parsed.event] : undefined
      if (!toEvents) {
        return []
      }

      if (
        webhookAuthorization &&
        !safeEqual(headers.get("authorization") ?? "", webhookAuthorization)
      ) {
        throw new InvalidWebhookError("Woovi webhook authorization header does not match")
      }

      const signature = headers.get("x-webhook-signature")
      if (!signature) {
        throw new InvalidWebhookError("Woovi webhook is missing x-webhook-signature")
      }

      const keys = await loadPublicKeys()
      const isSigned = keys.some((key) =>
        createVerify("sha256").update(body).verify(key, signature, "base64"),
      )
      if (!isSigned) {
        throw new InvalidWebhookError("Woovi webhook signature is invalid")
      }

      return toEvents(parsed)
    },

    async registerWebhook({ url }) {
      const { webhooks } = await request<{ webhooks: { url: string; event: string }[] }>(
        `/api/v1/webhook?url=${encodeURIComponent(url)}`,
      )
      const events = enabledMethods.some((method) => method === "pix_automatico")
        ? [...chargeEvents, ...pixAutomaticoEvents]
        : chargeEvents

      for (const event of events) {
        const isRegistered = webhooks.some(
          (webhook) => webhook.url === url && webhook.event === event,
        )
        if (isRegistered) {
          continue
        }

        await request("/api/v1/webhook", {
          method: "POST",
          body: {
            webhook: {
              name: `dunas ${event}`,
              event,
              url,
              authorization: webhookAuthorization,
              isActive: true,
            },
          },
        })
      }
    },

    async simulatePayment({ providerChargeId, method }) {
      if (!sandbox) {
        throw new Error("Woovi payments can only be simulated in sandbox")
      }

      if (method !== "pix") {
        throw new Error("Woovi only simulates Pix Automático from the sandbox dashboard")
      }

      const { transactionID } = await getCharge(providerChargeId)
      await request(`/openpix/testing?transactionID=${encodeURIComponent(transactionID)}`)
    },
  }
}

function chargeUpdated({ charge }: WooviWebhookBody): ProviderEvent[] {
  return charge?.correlationID
    ? [{ type: "charge.updated", providerChargeId: charge.correlationID }]
    : []
}

function toWooviCustomer({ name, email, taxId, phone }: PixPayer) {
  if (!name || (!taxId && !email && !phone)) {
    return undefined
  }

  return {
    name,
    taxID: taxId ?? undefined,
    email: email ?? undefined,
    phone: phone ?? undefined,
  }
}

function readWooviError(body: unknown) {
  if (typeof body !== "object" || body === null) {
    return null
  }

  const { error, errors } = body as { error?: unknown; errors?: { message?: string }[] }
  if (typeof error === "string") {
    return error
  }

  return errors?.[0]?.message ?? null
}
