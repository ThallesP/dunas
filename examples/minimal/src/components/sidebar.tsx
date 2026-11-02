import { Link } from "@tanstack/react-router"
import { CalendarDays, Sparkles } from "lucide-react"
import type { getUsage } from "../billing/functions.ts"

type SidebarProps = {
  usage: Awaited<ReturnType<typeof getUsage>>
}

const links = [
  { to: "/", label: "Agenda", icon: CalendarDays },
  { to: "/planos", label: "Planos", icon: Sparkles },
] as const

export function Sidebar({ usage }: SidebarProps) {
  const { used, limit } = usage.bookings
  const percent = limit === "unlimited" ? 0 : Math.min(100, (used / limit) * 100)

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-stone-200 border-r bg-white p-4">
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="grid size-7 place-items-center rounded-lg bg-brand font-bold text-sm text-white">
          a
        </span>
        <span className="font-semibold tracking-tight">agendaí</span>
      </div>
      <p className="mt-1 px-2 text-stone-500 text-xs">Barbearia do Zé</p>

      <nav className="mt-6 flex flex-col gap-0.5">
        {links.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-stone-600 text-sm hover:bg-stone-100 data-[status=active]:bg-stone-100 data-[status=active]:font-medium data-[status=active]:text-stone-900"
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-stone-200 bg-stone-50 p-3">
        <p className="font-medium text-sm">Plano {usage.planName}</p>
        <p className="mt-0.5 text-stone-500 text-xs">
          {used} de {limit === "unlimited" ? "∞" : limit} agendamentos este mês
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
        </div>
        {usage.planName === "Grátis" && (
          <Link
            to="/planos"
            className="mt-3 block rounded-lg bg-stone-900 py-1.5 text-center font-medium text-sm text-white hover:bg-stone-800"
          >
            Fazer upgrade
          </Link>
        )}
      </div>
    </aside>
  )
}
