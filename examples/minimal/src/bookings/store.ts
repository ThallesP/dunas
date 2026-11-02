import { database } from "../lib/database.ts"
import { services } from "./services.ts"

export type Booking = {
  id: string
  clientName: string
  service: string
  priceInCents: number
  startsAt: Date
}

type NewBooking = {
  clientName: string
  service: string
  startsAt: Date
}

const samples = [
  { clientName: "Rafael Souza", service: "Corte", inHours: 2 },
  { clientName: "Lucas Almeida", service: "Corte e barba", inHours: 4 },
  { clientName: "Bruno Lima", service: "Barba", inHours: 26 },
  { clientName: "Pedro Henrique", service: "Corte", inHours: 28 },
]

const ready = database.exec(`
  CREATE TABLE IF NOT EXISTS booking (
    id text PRIMARY KEY,
    customer_id text NOT NULL,
    client_name text NOT NULL,
    service text NOT NULL,
    price_in_cents integer NOT NULL,
    starts_at timestamptz NOT NULL
  )
`)

export async function selectBookings(customerId: string) {
  await ready
  const { rows } = await database.query<Booking>(
    `SELECT id, client_name AS "clientName", service, price_in_cents AS "priceInCents",
       starts_at AS "startsAt"
     FROM booking WHERE customer_id = $1
     ORDER BY starts_at`,
    [customerId],
  )
  return rows
}

export async function insertBooking(
  customerId: string,
  { clientName, service, startsAt }: NewBooking,
) {
  await ready
  const priceInCents = services.find(({ name }) => name === service)?.priceInCents ?? 0
  await database.query(
    `INSERT INTO booking (id, customer_id, client_name, service, price_in_cents, starts_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [crypto.randomUUID(), customerId, clientName, service, priceInCents, startsAt],
  )
}

export async function insertSamples(customerId: string) {
  for (const { inHours, ...sample } of samples) {
    const startsAt = new Date(Date.now() + inHours * 3_600_000)
    startsAt.setMinutes(0, 0, 0)
    await insertBooking(customerId, { ...sample, startsAt })
  }
  return samples.length
}
