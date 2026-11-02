import { createServerFn } from "@tanstack/react-start"
import { billing } from "../billing/dunas.ts"
import { currentUser } from "../lib/session.ts"
import { insertBooking, insertSamples, selectBookings } from "./store.ts"

export const listBookings = createServerFn().handler(async () => {
  const { id } = currentUser()
  const bookings = await selectBookings(id)
  if (bookings.length > 0) {
    return bookings
  }

  const amount = await insertSamples(id)
  await billing.track({ customerId: id, featureId: "bookings", amount })
  return selectBookings(id)
})

export const createBooking = createServerFn({ method: "POST" })
  .validator((input: { clientName: string; service: string; startsAt: string }) => input)
  .handler(async ({ data }) => {
    const { id } = currentUser()
    const { allowed } = await billing.consume({ customerId: id, featureId: "bookings" })
    if (!allowed) {
      return { created: false }
    }

    await insertBooking(id, { ...data, startsAt: new Date(data.startsAt) })
    return { created: true }
  })
