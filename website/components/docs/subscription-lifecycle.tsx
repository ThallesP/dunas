const states = [
  {
    status: "pending",
    label: "Aguardando",
    description: "Cobrança criada, esperando o primeiro pagamento.",
  },
  { status: "active", label: "Ativa", description: "Pago. O cliente tem tudo que o plano inclui." },
  {
    status: "past_due",
    label: "Em atraso",
    description: "O período acabou sem pagamento. Acesso mantido na carência.",
  },
  {
    status: "canceled",
    label: "Cancelada",
    description: "Fim da carência ou cancelamento. Volta ao plano padrão.",
  },
]

export function SubscriptionLifecycle() {
  return (
    <ol className="not-prose my-8 grid gap-3 sm:grid-cols-4">
      {states.map(({ status, label, description }, index) => (
        <li key={status} className="relative rounded-xl border bg-fd-card p-4">
          <p className="text-xs text-fd-muted-foreground">{index + 1}</p>
          <p className="mt-2 font-medium">{label}</p>
          <code className="text-xs text-fd-primary">{status}</code>
          <p className="mt-2 text-xs text-fd-muted-foreground">{description}</p>
        </li>
      ))}
    </ol>
  )
}
