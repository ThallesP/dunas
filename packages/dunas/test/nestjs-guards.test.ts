import "reflect-metadata"
import { PGlite } from "@electric-sql/pglite"
import { Controller, Get, Module } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { ExpressAdapter } from "@nestjs/platform-express"
import { FastifyAdapter } from "@nestjs/platform-fastify"
import { describe, expect, it, onTestFinished } from "vitest"
import { createDunas, pglite } from "../src/index.ts"
import { createDunasDecorators } from "../src/integrations/nestjs.ts"
import { fakeProvider } from "./fake-provider.ts"
import { free, setup } from "./setup.ts"

const adapters = {
  express: () => new ExpressAdapter(),
  fastify: () => new FastifyAdapter(),
}

async function start(adapter: keyof typeof adapters) {
  const { billing } = await setup()
  const { RequireFeature, Consume } = createDunasDecorators(billing)

  class ChatController {
    proModels() {
      return { ok: true }
    }

    fiveMessages() {
      return { ok: true }
    }

    send() {
      return { ok: true }
    }
  }
  Controller("chat")(ChatController)
  route(ChatController, "proModels", Get("pro-models"), RequireFeature("pro_models"))
  route(ChatController, "fiveMessages", Get("five"), RequireFeature("messages", { required: 5 }))
  route(ChatController, "send", Get("send"), Consume("messages", { amount: 4 }))

  class AppModule {}
  Module({ controllers: [ChatController] })(AppModule)

  const app = await NestFactory.create(AppModule, adapters[adapter](), { logger: false })
  await app.listen(0)
  onTestFinished(() => app.close())
  const url = (await app.getUrl()).replace("[::1]", "localhost")

  async function get(path: string, headers: Record<string, string> = { "x-user": "user_1" }) {
    const response = await fetch(`${url}${path}`, { headers })
    return { status: response.status, body: await response.json() }
  }

  return { billing, get }
}

function route<TController>(
  controller: { prototype: TController },
  name: keyof TController & string,
  ...decorators: MethodDecorator[]
) {
  const descriptor = Object.getOwnPropertyDescriptor(controller.prototype, name) ?? {}
  for (const decorator of decorators) {
    decorator(controller.prototype as object, name, descriptor)
  }
}

describe.each(Object.keys(adapters) as (keyof typeof adapters)[])("guards on %s", (adapter) => {
  it("lets a route through only when the plan includes the feature", async () => {
    const { billing, get } = await start(adapter)

    expect(await get("/chat/pro-models")).toEqual({
      status: 402,
      body: {
        error: { code: "FEATURE_NOT_ALLOWED", message: 'The plan does not include "pro_models"' },
      },
    })

    const result = await billing.subscribe({ customerId: "user_1", planId: "pro" })
    if (result.next.type === "none") {
      throw new Error("expected a pending payment")
    }
    await billing.simulatePayment({ chargeId: result.next.chargeId })

    expect(await get("/chat/pro-models")).toEqual({ status: 200, body: { ok: true } })
  })

  it("consumes usage before the route and stops at the limit", async () => {
    const { billing, get } = await start(adapter)

    expect((await get("/chat/send")).status).toBe(200)
    expect((await get("/chat/send")).status).toBe(200)
    expect(await get("/chat/send")).toEqual({
      status: 402,
      body: {
        error: { code: "LIMIT_REACHED", message: 'The plan limit for "messages" is reached' },
      },
    })
    const { balances } = await billing.getCustomer({ customerId: "user_1" })
    expect(balances.messages).toMatchObject({ used: 8, remaining: 2 })
  })

  it("checks the required amount without consuming it", async () => {
    const { billing, get } = await start(adapter)

    expect((await get("/chat/five")).status).toBe(200)
    await billing.track({ customerId: "user_1", featureId: "messages", amount: 6 })

    expect((await get("/chat/five")).status).toBe(402)
  })

  it("answers 401 when identify finds no customer", async () => {
    const { get } = await start(adapter)

    expect(await get("/chat/send", {})).toEqual({
      status: 401,
      body: { error: { code: "UNAUTHORIZED", message: "No customer for this request" } },
    })
  })
})

describe("createDunasDecorators", () => {
  it("types feature ids from the billing plans", async () => {
    const { billing } = await setup()
    const { RequireFeature, Consume } = createDunasDecorators(billing)

    RequireFeature("pro_models")
    RequireFeature("messages", { required: 2 })
    Consume("seats")
    // @ts-expect-error boolean features have no amount to require
    RequireFeature("pro_models", { required: 2 })
    // @ts-expect-error boolean features cannot be consumed
    Consume("pro_models")
    // @ts-expect-error unknown feature
    RequireFeature("not_a_feature")
  })

  it("fails at boot when createDunas has no identify", () => {
    const billing = createDunas({
      database: pglite(new PGlite()),
      plans: [free],
      providers: [fakeProvider("fake")],
    })

    expect(() => createDunasDecorators(billing)).toThrow(
      "createDunasDecorators needs identify in createDunas to find the customer",
    )
  })
})
