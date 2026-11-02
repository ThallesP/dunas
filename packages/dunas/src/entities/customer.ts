export type Customer = {
  id: string
  name: string | null
  email: string | null
  taxId: string | null
  phone: string | null
  metadata: Record<string, unknown>
  usageAnchorAt: Date
  createdAt: Date
}

export const customerColumns = `
  id, name, email, tax_id AS "taxId", phone, metadata,
  usage_anchor_at AS "usageAnchorAt", created_at AS "createdAt"
`
