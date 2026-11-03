import { featuredProvider } from "@/lib/featured-provider"

const setupImports = ["createDunas", "pg", featuredProvider.id].sort().join(", ")

export const setupSnippet = `import { ${setupImports} } from "dunasjs"
import { free, pro } from "./plans"

export const billing = createDunas({
  database: pg(pool),
  plans: [free, pro],
  providers: [
    ${featuredProvider.setup},
  ],
})`

export const plansSnippet = `import { feature, plan } from "dunasjs"

export const messages = feature({ id: "messages", type: "metered" })

export const free = plan({ id: "free", default: true })

export const pro = plan({
  id: "pro",
  price: { amountInCents: 4_990, interval: "month" },
  includes: [messages({ limit: 5_000 })],
})`

export const routeSnippet = `import { billing } from "./dunas"

export async function POST(request: Request) {
  const user = await getUser(request)
  const { allowed } = await billing.consume({
    customerId: user.id,
    featureId: "messages",
  })
  if (!allowed) return new Response(null, { status: 402 })
  return Response.json(await reply(user))
}`
