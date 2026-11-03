import { feature, plan } from "dunasjs"

export const bookings = feature({ id: "bookings", type: "metered" })

export const free = plan({
  id: "free",
  name: "Grátis",
  default: true,
  includes: [bookings({ limit: 10 })],
})

export const pro = plan({
  id: "pro",
  name: "Pro",
  price: { amountInCents: 2_990, interval: "month" },
  includes: [bookings({ limit: 500 })],
})
