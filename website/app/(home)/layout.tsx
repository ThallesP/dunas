import type { Metadata } from "next"
import type { ReactNode } from "react"
import { CopyEditor } from "@/components/copy-editor/copy-editor"
import { fontVariables } from "@/lib/fonts"
import "./globals.css"

export const metadata: Metadata = {
  title: "dunas — o billing do seu SaaS em uma biblioteca",
  description:
    "Planos, assinaturas e limites de uso numa API só, rodando dentro do seu app e no seu Postgres.",
}

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={fontVariables}>
      <body>
        {children}
        {process.env.NODE_ENV === "development" && <CopyEditor />}
      </body>
    </html>
  )
}
