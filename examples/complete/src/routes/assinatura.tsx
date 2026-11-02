import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router"
import { CircleCheck, LoaderCircle } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import {
  cancelSubscription,
  changePlan,
  getPaymentStatus,
  getSubscription,
} from "../billing/functions.ts"
import { paymentMethodDetails } from "../billing/payment-methods.ts"
import { formatDate, formatMoney } from "../lib/format.ts"

type Search = {
  pagamento?: "confirmando" | "confirmado"
}

export const Route = createFileRoute("/assinatura")({
  validateSearch: (search): Search => ({
    pagamento:
      search.pagamento === "confirmando" || search.pagamento === "confirmado"
        ? search.pagamento
        : undefined,
  }),
  loader: () => getSubscription(),
  component: Subscription,
})

function Subscription() {
  const { plan, subscription, pendingPlanId, bookings } = Route.useLoaderData()
  const { pagamento } = Route.useSearch()
  const router = useRouter()
  const [isSaving, setSaving] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setSaving(true)
    await action()
    setSaving(false)
    router.invalidate()
  }

  const periodEnd = subscription?.currentPeriodEnd
    ? formatDate(subscription.currentPeriodEnd)
    : null
  const limit = bookings.limit === "unlimited" ? null : bookings.limit

  return (
    <>
      <h1 className="font-semibold text-2xl tracking-tight">Assinatura</h1>
      <p className="mt-1 text-stone-500 text-sm">Seu plano, seu uso e como você paga.</p>

      {pagamento === "confirmando" && <ConfirmingPayment />}
      {pagamento === "confirmado" && (
        <Banner>
          <CircleCheck className="size-4" />
          Pagamento confirmado. Bem-vindo ao Pro.
        </Banner>
      )}

      {pendingPlanId && pagamento !== "confirmando" && (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
          Falta concluir o pagamento do plano Pro.
          <Link
            to="/assinar/$planId"
            params={{ planId: pendingPlanId }}
            className="font-medium underline"
          >
            Concluir pagamento
          </Link>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-4">
        <Card title="Plano">
          <div className="flex items-start justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold text-lg">
                {plan?.name}
                {subscription && <StatusBadge {...subscription} />}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                {plan?.price ? `${formatMoney(plan.price.amountInCents)} por mês` : "R$ 0 por mês"}
                {periodEnd &&
                  (subscription?.cancelAtPeriodEnd
                    ? ` · acesso ao Pro até ${periodEnd}`
                    : ` · próxima cobrança em ${periodEnd}`)}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to="/planos"
                className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-sm hover:bg-stone-50"
              >
                Mudar de plano
              </Link>
              {subscription && !subscription.cancelAtPeriodEnd && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => run(() => cancelSubscription())}
                  className="rounded-lg px-3 py-1.5 font-medium text-red-700 text-sm hover:bg-red-50"
                >
                  Cancelar
                </button>
              )}
              {subscription?.cancelAtPeriodEnd && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => run(() => changePlan({ data: "pro" }))}
                  className="rounded-lg bg-stone-900 px-3 py-1.5 font-medium text-sm text-white hover:bg-stone-800"
                >
                  Manter o Pro
                </button>
              )}
            </div>
          </div>
        </Card>

        <Card title="Uso neste mês">
          <div className="flex justify-between text-sm">
            <span>Agendamentos</span>
            <span className="text-stone-500 tabular-nums">
              {bookings.used} de {limit ?? "∞"}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${limit ? Math.min(100, (bookings.used / limit) * 100) : 0}%` }}
            />
          </div>
          {bookings.resetsAt && (
            <p className="mt-2 text-stone-500 text-xs">Zera em {formatDate(bookings.resetsAt)}</p>
          )}
        </Card>

        {subscription && (
          <Card title="Forma de pagamento">
            <p className="font-medium text-sm">{paymentMethodDetails[subscription.method].label}</p>
            <p className="mt-0.5 text-sm text-stone-500">
              {subscription.method === "pix"
                ? "Mandamos um Pix novo alguns dias antes de cada vencimento."
                : "Cobrado automaticamente todo mês."}
            </p>
          </Card>
        )}
      </div>
    </>
  )
}

function ConfirmingPayment() {
  const navigate = useNavigate()
  const [hasTimedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const startedAt = Date.now()
    const interval = setInterval(async () => {
      const status = await getPaymentStatus()
      if (status === "paid") {
        navigate({ to: "/assinatura", search: { pagamento: "confirmado" } })
      }
      if (Date.now() - startedAt > 60_000) {
        setTimedOut(true)
        clearInterval(interval)
      }
    }, 2_000)
    return () => clearInterval(interval)
  }, [navigate])

  return (
    <Banner>
      {hasTimedOut ? (
        "Ainda não recebemos a confirmação. Assim que o pagamento cair, o Pro é liberado."
      ) : (
        <>
          <LoaderCircle className="size-4 animate-spin" />
          Confirmando seu pagamento…
        </>
      )}
    </Banner>
  )
}

function StatusBadge({
  status,
  cancelAtPeriodEnd,
}: {
  status: string
  cancelAtPeriodEnd: boolean
}) {
  const badge = cancelAtPeriodEnd
    ? { label: "Cancelamento agendado", className: "bg-stone-100 text-stone-600" }
    : status === "past_due"
      ? { label: "Pagamento atrasado", className: "bg-red-50 text-red-700" }
      : { label: "Ativa", className: "bg-emerald-50 text-emerald-700" }

  return (
    <span className={`rounded-md px-2 py-0.5 font-medium text-xs ${badge.className}`}>
      {badge.label}
    </span>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="mb-3 font-medium text-sm text-stone-500">{title}</h2>
      {children}
    </section>
  )
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm">
      {children}
    </div>
  )
}
