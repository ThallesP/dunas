import { RootProvider } from "fumadocs-ui/provider/next"
import type { Metadata } from "next"
import type { ReactNode } from "react"
import { fontVariables } from "@/lib/fonts"
import { translations } from "./translations"
import "./docs.css"

export const metadata: Metadata = {
  title: { template: "%s — dunas", default: "Documentação — dunas" },
}

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`dark ${fontVariables}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider
          theme={{ forcedTheme: "dark", defaultTheme: "dark", hotKey: false }}
          i18n={{ locale: "pt-BR", translations }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  )
}
