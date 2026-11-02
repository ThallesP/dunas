import { once } from "node:events"
import { createServer, type RequestListener } from "node:http"
import { buffer, text } from "node:stream/consumers"
import { describe, expect, it, onTestFinished } from "vitest"
import { toNodeHandler } from "../src/http/node.ts"
import { setup } from "./setup.ts"

async function serve(listener: RequestListener) {
  const server = createServer(listener).listen(0)
  await once(server, "listening")
  onTestFinished(() => {
    server.close()
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("server is not listening on a port")
  }
  return `http://localhost:${address.port}`
}

async function echo(request: Request) {
  return Response.json({ method: request.method, url: request.url, body: await request.text() })
}

function subscribePro() {
  return {
    method: "POST",
    headers: { "x-user": "user_1", "content-type": "application/json" },
    body: JSON.stringify({ planId: "pro" }),
  }
}

describe("toNodeHandler", () => {
  it("serves JSON from the billing handler", async () => {
    const { billing } = await setup()
    const url = await serve(toNodeHandler(billing.handler))

    const response = await fetch(`${url}/api/dunas/plans`, { headers: { "x-user": "user_1" } })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/json")
    expect(await response.json()).toMatchObject([
      { id: "free", action: "current" },
      { id: "pro", action: "upgrade" },
      { id: "business", action: "upgrade" },
      { id: "extra_messages", action: "subscribe" },
    ])
  })

  it("reads the body from the request stream", async () => {
    const { billing } = await setup()
    const url = await serve(toNodeHandler(billing.handler))

    const response = await fetch(`${url}/api/dunas/subscribe`, subscribePro())

    expect(await response.json()).toMatchObject({
      subscription: { planId: "pro", status: "pending" },
      next: { type: "redirect" },
    })
  })

  it("prefers rawBody byte for byte over the parsed body", async () => {
    const rawBody = '{ "event" :"transparent.completed",\n  "nome": "João" }'
    const url = await serve(async (req, res) => {
      const bytes = await buffer(req)
      const body = JSON.parse(bytes.toString())
      await toNodeHandler(echo)(Object.assign(req, { rawBody: bytes, body }), res)
    })

    const response = await fetch(`${url}/api/dunas/webhooks/abacatepay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    })

    expect(await response.json()).toMatchObject({ method: "POST", body: rawBody })
  })

  it("re-serializes a body a parser already turned into an object", async () => {
    const { billing } = await setup()
    const url = await serve(async (req, res) => {
      const body = JSON.parse(await text(req))
      await toNodeHandler(billing.handler)(Object.assign(req, { body }), res)
    })

    const response = await fetch(`${url}/api/dunas/subscribe`, subscribePro())

    expect(await response.json()).toMatchObject({ next: { type: "redirect" } })
  })

  it("rebuilds the public URL from originalUrl and x-forwarded-proto", async () => {
    const url = await serve((req, res) =>
      toNodeHandler(echo)(Object.assign(req, { originalUrl: req.url, url: "/plans?page=2" }), res),
    )

    const response = await fetch(`${url}/api/dunas/plans?page=2`, {
      headers: { "x-forwarded-proto": "https, http" },
    })

    expect(await response.json()).toEqual({
      method: "GET",
      url: `${url.replace("http:", "https:")}/api/dunas/plans?page=2`,
      body: "",
    })
  })

  it("sends every set-cookie header", async () => {
    const url = await serve(
      toNodeHandler(
        async () =>
          new Response("ok", {
            headers: [
              ["set-cookie", "a=1; Path=/"],
              ["set-cookie", "b=2; Path=/"],
            ],
          }),
      ),
    )

    const response = await fetch(url)

    expect(response.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"])
    expect(await response.text()).toBe("ok")
  })

  it("passes error statuses through", async () => {
    const { billing } = await setup()
    const url = await serve(toNodeHandler(billing.handler))

    const anonymous = await fetch(`${url}/api/dunas/plans`)
    const unknownPlan = await fetch(`${url}/api/dunas/subscribe`, {
      ...subscribePro(),
      body: JSON.stringify({ planId: "enterprise" }),
    })

    expect(anonymous.status).toBe(401)
    expect(await anonymous.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } })
    expect(unknownPlan.status).toBe(404)
    expect(await unknownPlan.json()).toMatchObject({ error: { code: "PLAN_NOT_FOUND" } })
  })
})
