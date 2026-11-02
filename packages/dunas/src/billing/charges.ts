import { queryMaybe, queryOne } from "../database/database.ts"
import { type Charge, type ChargeReason, chargeColumns } from "../entities/charge.ts"
import type { Customer } from "../entities/customer.ts"
import type { Subscription } from "../entities/subscription.ts"
import { createId } from "../lib/id.ts"
import {
  type CreatePixChargeInput,
  type PaymentProvider,
  ProviderError,
} from "../providers/provider.ts"
import type { Context } from "./context.ts"
import { DunasError } from "./errors.ts"
import { emit, event } from "./events.ts"
import { findProvider, orderProviders } from "./routing.ts"
import { settleCharge } from "./settlement.ts"

export type CreateChargeInput = {
  customer: Customer
  subscription: Subscription
  reason: ChargeReason
  item: { id: string; name: string }
  description: string
  expiresInSeconds: number
  periodStart: Date | null
  periodEnd: Date | null
  successUrl: string | null
}

export async function createCharge(context: Context, input: CreateChargeInput) {
  const { customer, subscription } = input
  const { method, checkout, amountInCents } = subscription
  const chargeId = createId("chg")
  const failures: ProviderError[] = []
  const providers = orderProviders(context, {
    customerId: customer.id,
    amountInCents,
    method,
    checkout,
  })

  for (const provider of providers) {
    try {
      const { providerCharge, providerSubscriptionId } = await requestCharge(
        provider,
        subscription,
        {
          chargeId,
          amountInCents,
          description: input.description,
          expiresInSeconds: input.expiresInSeconds,
          payer: {
            name: customer.name,
            email: customer.email,
            taxId: customer.taxId,
            phone: customer.phone,
          },
          item: input.item,
          checkout,
          successUrl: input.successUrl,
        },
      )

      const charge = await context.database.transaction(async (tx) => {
        if (providerSubscriptionId) {
          await tx.query(
            `UPDATE dunas_subscription SET provider = $2, provider_subscription_id = $3, updated_at = now()
             WHERE id = $1`,
            [subscription.id, provider.id, providerSubscriptionId],
          )
        }

        return queryOne<Charge>(
          tx,
          `INSERT INTO dunas_charge (
             id, customer_id, subscription_id, reason, provider, provider_charge_id, method, checkout,
             amount_in_cents, status, br_code, qr_code_image_url, payment_url, period_start, period_end,
             expires_at, synced_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           RETURNING ${chargeColumns}`,
          [
            chargeId,
            customer.id,
            subscription.id,
            input.reason,
            provider.id,
            providerCharge.providerChargeId,
            method,
            checkout,
            amountInCents,
            providerCharge.status,
            providerCharge.brCode,
            providerCharge.qrCodeImageUrl,
            providerCharge.paymentUrl,
            input.periodStart,
            input.periodEnd,
            providerCharge.expiresAt,
            context.now(),
          ],
        )
      })

      await emit([event(context, "charge.created", { charge })])
      return charge
    } catch (error) {
      if (!(error instanceof ProviderError)) {
        throw error
      }
      failures.push(error)
    }
  }

  throw new DunasError(
    "ALL_PROVIDERS_FAILED",
    `Could not create a ${method} charge: ${failures.map(({ message }) => message).join("; ")}`,
    { cause: failures },
  )
}

export async function getCharge({ database }: Context, chargeId: string) {
  const charge = await queryMaybe<Charge>(
    database,
    `SELECT ${chargeColumns} FROM dunas_charge WHERE id = $1`,
    [chargeId],
  )
  if (!charge) {
    throw new DunasError("CHARGE_NOT_FOUND", `Charge "${chargeId}" does not exist`)
  }
  return charge
}

export async function syncCharge(context: Context, chargeId: string) {
  const charge = await getCharge(context, chargeId)
  if (charge.status !== "pending" && charge.status !== "expired") {
    return charge
  }

  const state = await findProvider(context.providers, charge.provider).getChargeState(charge)
  const isPastExpiry = state.status === "pending" && charge.expiresAt <= context.now()
  return settleCharge(
    context,
    charge.id,
    isPastExpiry ? { status: "expired", paidAt: null } : state,
  )
}

export async function syncProviderCharge(
  context: Context,
  providerId: string,
  providerChargeId: string,
) {
  const charge = await queryMaybe<{ id: string }>(
    context.database,
    "SELECT id FROM dunas_charge WHERE provider = $1 AND provider_charge_id = $2",
    [providerId, providerChargeId],
  )
  if (!charge) {
    return null
  }
  return syncCharge(context, charge.id)
}

export async function simulatePayment(context: Context, chargeId: string) {
  const charge = await getCharge(context, chargeId)
  const provider = findProvider(context.providers, charge.provider)
  if (!provider.simulatePayment) {
    throw new DunasError(
      "SIMULATION_NOT_SUPPORTED",
      `Provider "${provider.id}" cannot simulate payments`,
    )
  }

  await provider.simulatePayment(charge)
  return syncCharge(context, chargeId)
}

async function requestCharge(
  provider: PaymentProvider,
  { method, interval }: Subscription,
  input: CreatePixChargeInput,
) {
  if (method === "pix") {
    return { providerCharge: await provider.createPixCharge(input), providerSubscriptionId: null }
  }

  if (!provider.createSubscription) {
    throw new DunasError("METHOD_NOT_AVAILABLE", `Provider "${provider.id}" has no ${method}`)
  }

  const { providerSubscriptionId, ...providerCharge } = await provider.createSubscription({
    ...input,
    method,
    interval,
  })
  return { providerCharge, providerSubscriptionId }
}
