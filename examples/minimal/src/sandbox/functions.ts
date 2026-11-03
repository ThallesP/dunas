import { createServerFn } from "@tanstack/react-start"
import { DunasError } from "dunasjs"
import { billing } from "../billing/dunas.ts"
import { database } from "../lib/database.ts"
import { currentUser } from "../lib/session.ts"

type PendingCharge = {
  id: string
  provider: string
  method: string
  checkout: string
  amountInCents: number
}

export const getPendingCharge = createServerFn().handler(async () => {
  const { rows } = await database.query<PendingCharge>(
    `SELECT id, provider, method, checkout, amount_in_cents AS "amountInCents" FROM dunas_charge
     WHERE customer_id = $1 AND status = 'pending' AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [currentUser().id],
  )
  const charge = rows[0]
  if (!charge) {
    return null
  }

  const { status } = await billing.syncCharge({ chargeId: charge.id })
  return status === "pending" ? charge : null
})

export const simulatePayment = createServerFn({ method: "POST" })
  .validator((chargeId: string) => chargeId)
  .handler(async ({ data: chargeId }) => {
    try {
      await billing.simulatePayment({ chargeId })
      return { error: null }
    } catch (error) {
      if (error instanceof DunasError && error.code === "SIMULATION_NOT_SUPPORTED") {
        return {
          error: "Esse provedor não simula por API. Pague na página dele, em modo de teste.",
        }
      }
      return { error: error instanceof Error ? error.message : "Não deu para simular" }
    }
  })
