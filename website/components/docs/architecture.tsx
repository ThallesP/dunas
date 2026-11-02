const places = [
  {
    side: "No seu servidor",
    title: "Seu código",
    description:
      "Os planos, num arquivo TypeScript versionado com o app. O dunas roda aqui, como uma dependência.",
  },
  {
    side: "No seu servidor",
    title: "Seu Postgres",
    description: "Clientes, assinaturas, cobranças e o uso de cada feature, em tabelas dunas_*.",
  },
  {
    side: "Fora",
    title: "O provedor",
    description: "Só o pagamento. Gera a cobrança, recebe o dinheiro e avisa quando foi pago.",
  },
]

export function Architecture() {
  return (
    <div className="not-prose my-8 grid gap-x-8 gap-y-6 text-sm sm:grid-cols-3">
      <Bracket label="No seu servidor" className="col-span-2" />
      <Bracket label="Fora" />
      {places.map(({ side, title, description }) => (
        <div key={title} className="border-t pt-4 sm:border-t-0 sm:pt-0">
          <p className="mb-2 text-xs text-fd-muted-foreground sm:hidden">{side}</p>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-fd-muted-foreground">{description}</p>
        </div>
      ))}
    </div>
  )
}

type BracketProps = {
  label: string
  className?: string
}

function Bracket({ label, className = "" }: BracketProps) {
  return (
    <div className={`hidden sm:block ${className}`}>
      <p className="mb-2 text-xs text-fd-muted-foreground">{label}</p>
      <div className="h-1.5 border-x border-t border-fd-border" />
    </div>
  )
}
