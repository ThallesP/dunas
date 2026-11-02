import type { BillingInterval } from "../catalog/plan.ts"

export type ChargeStatus = "pending" | "paid" | "expired" | "canceled" | "refunded"

export type PaymentMethod = "pix" | "pix_automatico" | "card"

export type RecurringMethod = Exclude<PaymentMethod, "pix">

export type Checkout = "hosted" | "embedded"

export type Capabilities = { [TMethod in PaymentMethod]?: Checkout }

export type PixPayer = {
  name: string | null
  email: string | null
  taxId: string | null
  phone: string | null
}

export type CreatePixChargeInput = {
  chargeId: string
  amountInCents: number
  description: string
  expiresInSeconds: number
  payer: PixPayer
  item: { id: string; name: string }
  checkout: Checkout
  successUrl: string | null
}

export type CreateSubscriptionInput = CreatePixChargeInput & {
  method: RecurringMethod
  interval: BillingInterval
}

export type ProviderCharge = {
  providerChargeId: string
  status: ChargeStatus
  brCode: string | null
  qrCodeImageUrl: string | null
  paymentUrl: string | null
  expiresAt: Date
}

export type ProviderSubscription = ProviderCharge & {
  providerSubscriptionId: string
}

export type ProviderChargeState = {
  status: ChargeStatus
  paidAt: Date | null
}

export type ChargeReference = {
  providerChargeId: string
  method: PaymentMethod
  checkout: Checkout
}

export type ProviderEvent =
  | { type: "charge.updated"; providerChargeId: string }
  | {
      type: "subscription.paid"
      providerSubscriptionId: string
      checkoutId: string | null
      providerPaymentId: string
      isFirstPayment: boolean
      amountInCents: number
      paidAt: Date | null
    }
  | { type: "subscription.ended"; providerSubscriptionId: string; reason: "revoked" | "failed" }

export type WebhookRequest = {
  url: URL
  headers: Headers
  body: string
}

export type PaymentProvider<
  TId extends string = string,
  TCapabilities extends Capabilities = Capabilities,
> = {
  id: TId
  methods: readonly (keyof TCapabilities)[]
  checkouts: { [TMethod in keyof TCapabilities]: readonly NonNullable<TCapabilities[TMethod]>[] }
  createPixCharge(input: CreatePixChargeInput): Promise<ProviderCharge>
  createSubscription?(input: CreateSubscriptionInput): Promise<ProviderSubscription>
  cancelSubscription?(providerSubscriptionId: string): Promise<void>
  getChargeState(charge: ChargeReference): Promise<ProviderChargeState>
  parseWebhook(request: WebhookRequest): Promise<ProviderEvent[]>
  registerWebhook(input: { url: string }): Promise<void>
  simulatePayment?(charge: ChargeReference): Promise<void>
}

export type MethodOf<TProviders extends readonly PaymentProvider[]> =
  TProviders[number]["methods"][number]

export type CheckoutOf<
  TProviders extends readonly PaymentProvider[],
  TMethod extends PaymentMethod,
> = TProviders[number] extends infer TProvider
  ? TProvider extends { checkouts: infer TCheckouts }
    ? TMethod extends keyof TCheckouts
      ? NonNullable<TCheckouts[TMethod]> extends readonly (infer TCheckout)[]
        ? TCheckout
        : never
      : never
    : never
  : never

export class ProviderError extends Error {
  readonly provider: string
  readonly status: number | null

  constructor({
    provider,
    status,
    message,
  }: { provider: string; status: number | null; message: string }) {
    super(`${provider}: ${message}`)
    this.name = "ProviderError"
    this.provider = provider
    this.status = status
  }
}

export class InvalidWebhookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidWebhookError"
  }
}

export async function requestJson<TResponse>({
  provider,
  url,
  method = "GET",
  headers,
  body,
  readError,
}: {
  provider: string
  url: string
  method?: "GET" | "POST" | "PUT" | "DELETE"
  headers: Record<string, string>
  body?: unknown
  readError: (body: unknown) => string | null
}): Promise<TResponse> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch((error: unknown) => {
    throw new ProviderError({
      provider,
      status: null,
      message: `request failed (${String(error)})`,
    })
  })

  const text = await response.text()
  const parsed = parseJson(text)

  if (!response.ok) {
    const message = readError(parsed) ?? (text.slice(0, 300) || response.statusText)
    throw new ProviderError({ provider, status: response.status, message })
  }

  return parsed as TResponse
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
