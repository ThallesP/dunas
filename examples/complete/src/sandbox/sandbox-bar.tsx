import { useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { getPendingCharge, simulatePayment } from "./functions.ts"

type PendingCharge = Awaited<ReturnType<typeof getPendingCharge>>

export function SandboxBar() {
  const router = useRouter()
  const [charge, setCharge] = useState<PendingCharge>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let previousId: string | null = null
    async function refresh() {
      const latest = await getPendingCharge()
      if (previousId && !latest) {
        router.invalidate()
      }
      previousId = latest?.id ?? null
      setCharge(latest)
    }
    refresh()
    const interval = setInterval(refresh, 3_000)
    return () => clearInterval(interval)
  }, [router])

  if (!charge) {
    return null
  }

  async function pay(chargeId: string) {
    const result = await simulatePayment({ data: chargeId })
    setError(result.error)
    if (!result.error) {
      setCharge(null)
      router.invalidate()
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 flex items-center justify-center gap-3 border-amber-200 border-t bg-amber-50 px-4 py-2.5 text-amber-900 text-sm">
      <span>
        <strong>Sandbox</strong> · cobrança de R$ {(charge.amountInCents / 100).toFixed(2)}{" "}
        esperando pagamento ({charge.method}, {charge.checkout})
      </span>
      <button
        type="button"
        onClick={() => pay(charge.id)}
        className="rounded-md border border-amber-300 bg-white px-3 py-1 font-medium hover:bg-amber-100"
      >
        Simular pagamento
      </button>
      {error && <span className="text-red-700">{error}</span>}
    </div>
  )
}
