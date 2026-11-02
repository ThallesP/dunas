import type { ChargeStatus, Checkout, PaymentMethod } from "../providers/provider.ts"

export type ChargeReason = "subscription_start" | "subscription_renewal"

export type Charge = {
  id: string
  customerId: string
  subscriptionId: string | null
  reason: ChargeReason
  provider: string
  providerChargeId: string
  method: PaymentMethod
  checkout: Checkout
  amountInCents: number
  status: ChargeStatus
  brCode: string | null
  qrCodeImageUrl: string | null
  paymentUrl: string | null
  periodStart: Date | null
  periodEnd: Date | null
  expiresAt: Date
  paidAt: Date | null
  syncedAt: Date
  createdAt: Date
}

export type PixNext = {
  type: "pix"
  chargeId: string
  brCode: string
  qrCodeImageUrl: string | null
  expiresAt: Date
}

export type RedirectNext = {
  type: "redirect"
  chargeId: string
  url: string
}

export type NoneNext = {
  type: "none"
}

export type Next = PixNext | RedirectNext | NoneNext

export type NextFor<TCheckout extends Checkout> = TCheckout extends "hosted"
  ? RedirectNext
  : PixNext

export const chargeColumns = `
  id, customer_id AS "customerId", subscription_id AS "subscriptionId", reason, provider,
  provider_charge_id AS "providerChargeId", method, checkout, amount_in_cents AS "amountInCents", status,
  br_code AS "brCode", qr_code_image_url AS "qrCodeImageUrl", payment_url AS "paymentUrl",
  period_start AS "periodStart", period_end AS "periodEnd", expires_at AS "expiresAt",
  paid_at AS "paidAt", synced_at AS "syncedAt", created_at AS "createdAt"
`

export function nextFor(charge: Charge): PixNext | RedirectNext {
  if (charge.checkout === "hosted" && charge.paymentUrl) {
    return { type: "redirect", chargeId: charge.id, url: charge.paymentUrl }
  }

  if (charge.checkout === "embedded" && charge.brCode) {
    return {
      type: "pix",
      chargeId: charge.id,
      brCode: charge.brCode,
      qrCodeImageUrl: charge.qrCodeImageUrl,
      expiresAt: charge.expiresAt,
    }
  }

  throw new Error(`Charge "${charge.id}" has no ${charge.checkout} payment to show`)
}
