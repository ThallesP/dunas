import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Check } from "lucide-react"
import { type ReactNode, useState } from "react"
import { getPlans, subscribe } from "../billing/functions.ts"
import { formatDate, formatMoney } from "../lib/format.ts"

export const Route = createFileRoute("/planos")({
  loader: () => getPlans(),
  component: Plans,
})

const buttonLabels = {
  current: "Seu plano",
  subscribe: "Assinar o Pro",
  upgrade: "Assinar o Pro",
  downgrade: "Mudar para o Grátis",
  pending_payment: "Abrir pagamento",
  resume: "Manter o Pro",
  scheduled: "Seu plano a partir do fim do mês",
}

const paymentActions: string[] = ["subscribe", "upgrade", "pending_payment"]

const perks = {
  free: ["Página de agendamento online", "1 profissional"],
  pro: ["Página de agendamento online", "Profissionais ilimitados", "Suporte por WhatsApp"],
}

function Plans() {
  const { plans, changesAt } = Route.useLoaderData()
  const router = useRouter()
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)

  async function choose(planId: "free" | "pro") {
    setLoadingPlanId(planId)
    const next = await subscribe({ data: planId })
    if (next.type === "redirect") {
      window.location.href = next.url
      return
    }
    setLoadingPlanId(null)
    router.invalidate()
  }

  return (
    <>
      <h1 className="font-semibold text-2xl tracking-tight">Planos</h1>
      <p className="mt-1 text-stone-500 text-sm">Mude quando quiser, sem fidelidade.</p>

      <div className="mt-8 grid grid-cols-2 gap-4">
        {plans.map((plan) => {
          const isDisabled = plan.action === "current" || plan.action === "scheduled"
          const isHighlighted = plan.id === "pro"

          return (
            <section
              key={plan.id}
              className={`flex flex-col rounded-2xl border bg-white p-6 ${isHighlighted ? "border-brand ring-1 ring-brand" : "border-stone-200"}`}
            >
              <h2 className="font-semibold">{plan.name}</h2>
              <p className="mt-3">
                <span className="font-semibold text-3xl tracking-tight">
                  {plan.price ? formatMoney(plan.price.amountInCents) : "R$ 0"}
                </span>
                <span className="text-stone-500 text-sm"> /mês</span>
              </p>

              <ul className="mt-6 flex flex-1 flex-col gap-2 text-sm text-stone-700">
                <Perk>Até {plan.bookingsLimit} agendamentos por mês</Perk>
                {perks[plan.id].map((perk) => (
                  <Perk key={perk}>{perk}</Perk>
                ))}
              </ul>

              {plan.action === "pending_payment" && (
                <p className="mt-6 text-amber-700 text-xs">
                  Esperando a confirmação do pagamento. Se você já pagou, ela chega em instantes.
                </p>
              )}
              {plan.action === "resume" && changesAt && (
                <p className="mt-6 text-stone-500 text-xs">
                  Você volta para o Grátis em {formatDate(changesAt)}.
                </p>
              )}

              <button
                type="button"
                disabled={isDisabled || loadingPlanId !== null}
                onClick={() => choose(plan.id)}
                className={`mt-6 rounded-lg py-2 font-medium text-sm disabled:cursor-default ${
                  isHighlighted
                    ? "bg-brand text-white hover:opacity-90 disabled:opacity-60"
                    : "border border-stone-200 hover:bg-stone-50 disabled:text-stone-400 disabled:hover:bg-white"
                }`}
              >
                {buttonLabel({
                  action: plan.action,
                  changesAt,
                  isLoading: loadingPlanId === plan.id,
                })}
              </button>
            </section>
          )
        })}
      </div>

      <p className="mt-6 text-center text-stone-500 text-xs">
        Pagamento por Pix. A assinatura renova todo mês.
      </p>
    </>
  )
}

function buttonLabel({
  action,
  changesAt,
  isLoading,
}: {
  action: keyof typeof buttonLabels
  changesAt: Date | null
  isLoading: boolean
}) {
  if (isLoading) {
    return paymentActions.includes(action) ? "Abrindo pagamento…" : "Salvando…"
  }
  if (action === "scheduled" && changesAt) {
    return `Seu plano a partir de ${formatDate(changesAt)}`
  }
  return buttonLabels[action]
}

function Perk({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-brand" />
      <span>{children}</span>
    </li>
  )
}
