export const plansSnippet = `import { feature, plan } from "dunas"

const messages = feature({ id: "messages", type: "metered" })

export const free = plan({ id: "free", default: true, includes: [messages({ limit: 100 })] })
export const pro = plan({
  id: "pro",
  price: { amountInCents: 4_990, interval: "month" },
  includes: [messages({ limit: 5_000 })],
})`

export const subscribeSnippet = `const result = await dunas.subscribe({ planId: "pro" })

if (result.status === "pending_payment") {
  showCharge(result.charge)
  await dunas.waitForPayment({ chargeId: result.charge.id })
}`

export const consumeSnippet = `const { allowed } = await billing.consume({
  customerId: user.id,
  featureId: "messages",
})

if (!allowed) return Response.json({ error: "Limite do plano atingido" }, { status: 402 })`
