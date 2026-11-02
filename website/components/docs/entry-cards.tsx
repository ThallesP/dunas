import Link from "next/link"

const entries = [
  {
    title: "Começar",
    description: "Instale, declare os planos e cobre a primeira assinatura no sandbox.",
    href: "/docs/comecar",
    art: "url(/art/dunes-dawn.png) 30% 70%",
  },
  {
    title: "Como funciona",
    description: "O que roda no seu app, o que fica no seu banco e o que vai para o provedor.",
    href: "/docs/conceitos/como-funciona",
    art: "url(/art/dunes-night.png) 20% 60%",
  },
  {
    title: "Guias",
    description: "Limitar uso, montar a página de preços, testar pagamentos e ir para produção.",
    href: "/docs/guias/limitar-uso",
    art: "url(/art/dunes-dawn.png) 85% 40%",
  },
  {
    title: "Referência",
    description: "Cada método, opção e evento, com os tipos.",
    href: "/docs/referencia/servidor",
    art: "url(/art/dunes-night.png) 90% 75%",
  },
]

export function EntryCards() {
  return (
    <div className="not-prose my-8 grid gap-3 sm:grid-cols-2">
      {entries.map(({ title, description, href, art }) => (
        <Link
          key={href}
          href={href}
          className="group overflow-hidden rounded-xl border bg-fd-card transition-colors hover:border-fd-ring/40"
        >
          <div
            className="h-28 border-b [image-rendering:pixelated] transition-transform duration-500 group-hover:scale-[1.03]"
            style={{ background: art, backgroundSize: "260%" }}
          />
          <div className="p-4">
            <p className="font-medium text-fd-foreground">{title}</p>
            <p className="mt-1 text-sm text-fd-muted-foreground">{description}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}
