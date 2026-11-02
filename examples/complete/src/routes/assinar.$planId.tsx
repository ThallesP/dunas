import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router"
import type { PaymentMethod } from "dunas"
import { ArrowLeft, Copy, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { getCheckout, getPaymentStatus, startSubscription } from "../billing/functions.ts"
import { paymentMethodDetails } from "../billing/payment-methods.ts"
import { formatMoney } from "../lib/format.ts"

export const Route = createFileRoute("/assinar/$planId")({
  loader: async ({ params }) => {
    const checkout = await getCheckout({ data: params.planId })
    if (!checkout) {
      throw notFound()
    }
    return checkout
  },
  component: Checkout,
})

type Pix = {
  brCode: string
  qrCodeImageUrl: string | null
  expiresAt: Date
}

function Checkout() {
  const checkout = Route.useLoaderData()
  const [method, setMethod] = useState<PaymentMethod>(checkout.paymentMethods[0] ?? "pix")
  const [pix, setPix] = useState<Pix | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubscribe() {
    setSubmitting(true)
    setError(null)
    try {
      const next = await startSubscription({ data: { planId: checkout.id, method } })
      if (next.type === "redirect") {
        window.location.href = next.url
        return
      }
      if (next.type === "pix") {
        setPix(next)
      }
    } catch {
      setError("Não conseguimos abrir o pagamento. Tente de novo ou escolha outra forma.")
    }
    setSubmitting(false)
  }

  return (
    <>
      <Link
        to="/planos"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900"
      >
        <ArrowLeft className="size-4" />
        Planos
      </Link>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_280px] items-start gap-8">
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          {pix ? (
            <PixPayment pix={pix} />
          ) : (
            <>
              <h1 className="font-semibold text-xl tracking-tight">Como você quer pagar?</h1>
              <div className="mt-5 flex flex-col gap-2">
                {checkout.paymentMethods.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer gap-3 rounded-xl border border-stone-200 p-4 has-checked:border-brand has-checked:bg-brand-soft"
                  >
                    <input
                      type="radio"
                      name="method"
                      checked={method === option}
                      onChange={() => setMethod(option)}
                      className="mt-1 accent-brand"
                    />
                    <span>
                      <span className="block font-medium text-sm">
                        {paymentMethodDetails[option].label}
                      </span>
                      <span className="mt-0.5 block text-stone-500 text-sm">
                        {paymentMethodDetails[option].description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {error && <p className="mt-4 text-red-700 text-sm">{error}</p>}

              <button
                type="button"
                onClick={handleSubscribe}
                disabled={isSubmitting}
                className="mt-6 w-full rounded-lg bg-brand py-2.5 font-medium text-sm text-white hover:opacity-90 disabled:opacity-60"
              >
                {isSubmitting
                  ? "Abrindo pagamento…"
                  : `Assinar por ${formatMoney(checkout.price.amountInCents)}/mês`}
              </button>
              <p className="mt-3 text-center text-stone-500 text-xs">
                Cancele quando quiser. Você continua no {checkout.name} até o fim do mês pago.
              </p>
            </>
          )}
        </section>

        <aside className="rounded-2xl border border-stone-200 bg-white p-6">
          <p className="text-stone-500 text-sm">Sua assinatura</p>
          <p className="mt-1 font-semibold">Plano {checkout.name}</p>
          <dl className="mt-5 flex flex-col gap-2 border-stone-100 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500">Mensal</dt>
              <dd>{formatMoney(checkout.price.amountInCents)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Total hoje</dt>
              <dd>{formatMoney(checkout.price.amountInCents)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </>
  )
}

function PixPayment({ pix }: { pix: Pix }) {
  const navigate = useNavigate()
  const [hasCopied, setCopied] = useState(false)
  const [status, setStatus] = useState<string>("pending")
  const secondsLeft = useSecondsUntil(pix.expiresAt)

  useEffect(() => {
    const interval = setInterval(async () => {
      const latest = await getPaymentStatus()
      if (latest === "paid") {
        navigate({ to: "/assinatura", search: { pagamento: "confirmado" } })
      }
      setStatus(latest ?? "pending")
    }, 2_000)
    return () => clearInterval(interval)
  }, [navigate])

  async function copy() {
    await navigator.clipboard.writeText(pix.brCode)
    setCopied(true)
  }

  if (status === "expired" || secondsLeft === 0) {
    return (
      <div className="py-8 text-center">
        <p className="font-medium">O Pix expirou</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg border border-stone-200 px-4 py-2 text-sm hover:bg-stone-50"
        >
          Gerar outro
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="font-semibold text-xl tracking-tight">Pague com Pix</h1>
      <p className="mt-1 text-stone-500 text-sm">
        Abra o app do seu banco e escaneie o código, ou use o copia e cola.
      </p>
      {pix.qrCodeImageUrl && (
        <img
          src={pix.qrCodeImageUrl}
          alt="QR code do Pix"
          className="mt-6 size-52 rounded-xl border border-stone-200 p-2"
        />
      )}
      <div className="mt-6 flex w-full items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-1 pl-3">
        <code className="flex-1 truncate text-left text-stone-600 text-xs">{pix.brCode}</code>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 font-medium text-xs shadow-sm hover:bg-stone-100"
        >
          <Copy className="size-3.5" />
          {hasCopied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="mt-6 flex items-center gap-2 text-sm text-stone-500">
        <LoaderCircle className="size-4 animate-spin" />
        Esperando o pagamento · expira em {formatDuration(secondsLeft)}
      </p>
    </div>
  )
}

function useSecondsUntil(date: Date) {
  const [seconds, setSeconds] = useState(() => secondsUntil(date))

  useEffect(() => {
    const interval = setInterval(() => setSeconds(secondsUntil(date)), 1_000)
    return () => clearInterval(interval)
  }, [date])

  return seconds
}

function secondsUntil(date: Date) {
  return Math.max(0, Math.round((date.getTime() - Date.now()) / 1000))
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, "0")
  const seconds = String(totalSeconds % 60).padStart(2, "0")
  return hours > 0 ? `${hours}h${minutes}` : `${minutes}:${seconds}`
}
