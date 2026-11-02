import { queryMaybe, queryOne } from "../database/database.ts"
import { type Customer, customerColumns } from "../entities/customer.ts"
import { normalizeTaxId } from "../lib/tax-id.ts"
import type { Context } from "./context.ts"
import { DunasError } from "./errors.ts"

export type UpsertCustomerInput = {
  id: string
  name?: string
  email?: string
  taxId?: string
  phone?: string
  metadata?: Record<string, unknown>
}

export async function upsertCustomer(
  { database, now }: Context,
  { id, name, email, taxId, phone, metadata }: UpsertCustomerInput,
) {
  return queryOne<Customer>(
    database,
    `INSERT INTO dunas_customer (id, name, email, tax_id, phone, metadata, usage_anchor_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '{}'), $7)
     ON CONFLICT (id) DO UPDATE SET
       name = COALESCE($2, dunas_customer.name),
       email = COALESCE($3, dunas_customer.email),
       tax_id = COALESCE($4, dunas_customer.tax_id),
       phone = COALESCE($5, dunas_customer.phone),
       metadata = COALESCE($6::jsonb, dunas_customer.metadata),
       updated_at = now()
     RETURNING ${customerColumns}`,
    [
      id,
      name ?? null,
      email ?? null,
      taxId ? toTaxId(taxId) : null,
      phone ? toPhone(phone) : null,
      metadata ? JSON.stringify(metadata) : null,
      now(),
    ],
  )
}

export async function getOrCreateCustomer({ database, now }: Context, customerId: string) {
  const existing = await queryMaybe<Customer>(
    database,
    `SELECT ${customerColumns} FROM dunas_customer WHERE id = $1`,
    [customerId],
  )
  if (existing) {
    return existing
  }

  await database.query(
    "INSERT INTO dunas_customer (id, usage_anchor_at) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
    [customerId, now()],
  )
  return queryOne<Customer>(
    database,
    `SELECT ${customerColumns} FROM dunas_customer WHERE id = $1`,
    [customerId],
  )
}

function toTaxId(taxId: string) {
  const normalized = normalizeTaxId(taxId)
  if (!normalized) {
    throw new DunasError("INVALID_TAX_ID", `"${taxId}" is not a valid CPF or CNPJ`)
  }
  return normalized
}

function toPhone(phone: string) {
  const digits = phone.replace(/\D/g, "")

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits
  }

  throw new DunasError("INVALID_PHONE", `"${phone}" is not a valid Brazilian phone number`)
}
