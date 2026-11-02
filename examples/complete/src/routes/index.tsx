import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"
import { createBooking, listBookings } from "../bookings/functions.ts"
import { services } from "../bookings/services.ts"
import type { Booking } from "../bookings/store.ts"
import { formatDay, formatMoney, formatTime } from "../lib/format.ts"

export const Route = createFileRoute("/")({
  loader: () => listBookings(),
  component: Agenda,
})

function Agenda() {
  const bookings = Route.useLoaderData()
  const router = useRouter()
  const [isFormOpen, setFormOpen] = useState(false)
  const [isOverLimit, setOverLimit] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { created } = await createBooking({
      data: {
        clientName: String(form.get("clientName")),
        service: String(form.get("service")),
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
      },
    })
    setOverLimit(!created)
    if (created) {
      setFormOpen(false)
      router.invalidate()
    }
  }

  return (
    <>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Agenda</h1>
          <p className="mt-1 text-stone-500 text-sm">Seus próximos horários</p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(!isFormOpen)}
          className="flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 font-medium text-sm text-white hover:bg-stone-800"
        >
          <Plus className="size-4" />
          Novo agendamento
        </button>
      </header>

      {isOverLimit && (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          Você usou todos os agendamentos do plano Grátis neste mês.
          <Link to="/planos" className="font-medium underline">
            Ver planos
          </Link>
        </div>
      )}

      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3 rounded-xl border border-stone-200 bg-white p-4"
        >
          <Field id="clientName" label="Cliente">
            <input
              id="clientName"
              name="clientName"
              required
              placeholder="Nome"
              className={inputClass}
            />
          </Field>
          <Field id="service" label="Serviço">
            <select id="service" name="service" className={inputClass}>
              {services.map(({ name, priceInCents }) => (
                <option key={name} value={name}>
                  {name} · {formatMoney(priceInCents)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="startsAt" label="Quando">
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              required
              className={inputClass}
            />
          </Field>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 font-medium text-sm text-white hover:opacity-90"
          >
            Agendar
          </button>
        </form>
      )}

      <div className="mt-8 flex flex-col gap-8">
        {groupByDay(bookings).map(([day, dayBookings]) => (
          <section key={day}>
            <h2 className="font-medium text-sm text-stone-500 first-letter:uppercase">{day}</h2>
            <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
              {dayBookings.map((booking) => (
                <li key={booking.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="w-12 font-medium text-sm tabular-nums">
                    {formatTime(booking.startsAt)}
                  </span>
                  <span className="h-8 w-0.5 rounded-full bg-brand" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{booking.clientName}</p>
                    <p className="text-stone-500 text-xs">{booking.service}</p>
                  </div>
                  <span className="text-sm text-stone-600 tabular-nums">
                    {formatMoney(booking.priceInCents)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400"

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-stone-600 text-xs">
        {label}
      </label>
      {children}
    </div>
  )
}

function groupByDay(bookings: Booking[]) {
  const groups = new Map<string, Booking[]>()
  for (const booking of bookings) {
    const day = formatDay(booking.startsAt)
    groups.set(day, [...(groups.get(day) ?? []), booking])
  }
  return [...groups]
}
