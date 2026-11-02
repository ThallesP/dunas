import { createFileRoute, Link } from "@tanstack/react-router"
import { Lock } from "lucide-react"
import { getReport } from "../bookings/functions.ts"
import { formatMoney } from "../lib/format.ts"

export const Route = createFileRoute("/relatorios")({
  loader: () => getReport(),
  component: Reports,
})

function Reports() {
  const report = Route.useLoaderData()

  return (
    <>
      <h1 className="font-semibold text-2xl tracking-tight">Relatórios</h1>
      <p className="mt-1 text-stone-500 text-sm">Como a barbearia está indo neste mês.</p>

      {report ? (
        <div className="mt-8 grid grid-cols-2 gap-4">
          <Stat label="Faturamento previsto" value={formatMoney(report.revenueInCents)} />
          <Stat label="Agendamentos" value={String(report.bookingsCount)} />
          <Stat label="Ticket médio" value={formatMoney(report.averageTicketInCents)} />
          <Stat label="Serviço mais pedido" value={report.topService ?? "Nenhum ainda"} />
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-brand-soft text-brand">
            <Lock className="size-4" />
          </span>
          <p className="mt-4 font-semibold">Relatórios fazem parte do Pro</p>
          <p className="mt-1 max-w-sm text-sm text-stone-500">
            Veja quanto a barbearia vai faturar no mês, o ticket médio e os serviços mais pedidos.
          </p>
          <Link
            to="/assinar/$planId"
            params={{ planId: "pro" }}
            className="mt-6 rounded-lg bg-brand px-4 py-2 font-medium text-sm text-white hover:opacity-90"
          >
            Assinar o Pro
          </Link>
        </div>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-2 font-semibold text-2xl tracking-tight">{value}</p>
    </section>
  )
}
