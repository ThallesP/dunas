import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { getCookie, setCookie } from "hono/cookie"
import { billing } from "./billing.ts"
import { page } from "./page.ts"

await billing.migrate()

const app = new Hono()

app.get("/", (c) => {
  if (!getCookie(c, "user")) {
    setCookie(c, "user", `user-${crypto.randomUUID().slice(0, 8)}`)
  }
  return c.html(page)
})

app.post("/chat", async (c) => {
  const customerId = getCookie(c, "user") ?? ""
  const { allowed, balance } = await billing.consume({ customerId, featureId: "messages" })
  return c.json({ allowed, balance }, allowed ? 200 : 402)
})

app.post("/dev/pay/:chargeId", async (c) =>
  c.json(await billing.simulatePayment({ chargeId: c.req.param("chargeId") })),
)

app.all("/api/dunas/*", async (c) => {
  const response = await billing.handler(c.req.raw)
  if (c.req.path.includes("/webhooks/")) {
    console.log("webhook", c.req.path, response.status, await response.clone().text())
  }
  return response
})

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, async ({ port }) => {
  console.log(`http://localhost:${port}`)
  if (process.env.PUBLIC_URL) {
    console.log("webhooks", await billing.registerWebhooks({ baseUrl: process.env.PUBLIC_URL }))
  }
})
