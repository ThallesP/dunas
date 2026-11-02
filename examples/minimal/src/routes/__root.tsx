import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { getUsage } from "../billing/functions.ts"
import { Sidebar } from "../components/sidebar.tsx"
import { SandboxBar } from "../sandbox/sandbox-bar.tsx"
import styles from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "agendaí" },
    ],
    links: [
      { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
      { rel: "stylesheet", href: styles },
    ],
  }),
  loader: () => getUsage(),
  shellComponent: Document,
  component: AppLayout,
})

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function AppLayout() {
  const usage = Route.useLoaderData()

  return (
    <div className="flex min-h-screen">
      <Sidebar usage={usage} />
      <main className="flex-1 px-10 py-8">
        <div className="mx-auto max-w-3xl">
          <Outlet />
        </div>
      </main>
      {import.meta.env.DEV && <SandboxBar />}
    </div>
  )
}
