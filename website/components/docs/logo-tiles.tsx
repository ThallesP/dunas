import Image from "next/image"
import Link from "next/link"

export type LogoTilesProps = {
  items: { name: string; logo: string; href: string }[]
}

export function LogoTiles({ items }: LogoTilesProps) {
  return (
    <div className="not-prose my-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ name, logo, href }) => (
        <Link
          key={name}
          href={href}
          className="flex items-center gap-3 rounded-xl border bg-fd-card px-4 py-3 text-sm text-fd-foreground transition-colors hover:border-fd-ring/40"
        >
          <Image src={logo} alt="" width={20} height={20} className="size-5 object-contain" />
          {name}
        </Link>
      ))}
    </div>
  )
}
