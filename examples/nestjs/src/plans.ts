import { feature, plan } from "dunas"

export const messages = feature({ id: "messages", type: "metered" })
export const proModels = feature({ id: "pro_models", type: "boolean" })

export const free = plan({
  id: "free",
  default: true,
  includes: [messages({ limit: 5 })],
})

export const pro = plan({
  id: "pro",
  price: { amountInCents: 1_990, interval: "month" },
  includes: [messages({ limit: 100 }), proModels()],
})
