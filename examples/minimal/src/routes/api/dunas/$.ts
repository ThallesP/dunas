import { createFileRoute } from "@tanstack/react-router"
import { billing } from "../../../billing/dunas.ts"

export const Route = createFileRoute("/api/dunas/$")({
  server: {
    handlers: {
      GET: ({ request }) => billing.handler(request),
      POST: ({ request }) => billing.handler(request),
    },
  },
})
