import { createServerFn } from "@tanstack/react-start"
import { billing } from "../billing/dunas.ts"
import { currentUser } from "../lib/session.ts"
import { insertBooking, insertSamples, selectBookings } from "./store.ts"

export const listBookings = createServerFn().handler(() => bookingsFor(currentUser().id))

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

export const getReport = createServerFn().handler(async () => {
  const { id } = currentUser()
  const { allowed } = await billing.check({ customerId: id, featureId: "reports" })
  if (!allowed) {
    return null
  }

  const bookings = await bookingsFor(id)
  const revenueInCents = bookings.reduce((total, { priceInCents }) => total + priceInCents, 0)
  const countByService = new Map<string, number>()
  for (const { service } of bookings) {
    countByService.set(service, (countByService.get(service) ?? 0) + 1)
  }
  const [topService] = [...countByService].sort(([, a], [, b]) => b - a)

  return {
    bookingsCount: bookings.length,
    revenueInCents,
    averageTicketInCents: bookings.length > 0 ? Math.round(revenueInCents / bookings.length) : 0,
    topService: topService?.[0] ?? null,
  }
})

async function bookingsFor(customerId: string) {
  const bookings = await selectBookings(customerId)
  if (bookings.length > 0) {
    return bookings
  }

  const amount = await insertSamples(customerId)
  await billing.track({ customerId, featureId: "bookings", amount })
  return selectBookings(customerId)
}
