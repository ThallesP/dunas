import "reflect-metadata"
import { Body, Controller, Injectable, Module, Post } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { ExpressAdapter } from "@nestjs/platform-express"
import { FastifyAdapter } from "@nestjs/platform-fastify"
import { describe, expect, it, onTestFinished } from "vitest"
import type { DunasEvents } from "../src/billing/events.ts"
import { DunasModule, OnDunasEvent } from "../src/integrations/nestjs.ts"
import { setup } from "./setup.ts"

const webhookBody = '{ "event" :"transparent.completed",\n  "nome": "Jo\\u00e3o" }'

const billing = {
  basePath: "/api/dunas",
  handler: async (request: Request) =>
    Response.json({ path: new URL(request.url).pathname, body: await request.text() }),
  on: () => () => {},
}

class EchoController {
  echo(body: unknown) {
    return { body }
  }
}
Controller("echo")(EchoController)
Post()(
  EchoController.prototype,
  "echo",
  Object.getOwnPropertyDescriptor(EchoController.prototype, "echo") ?? {},
)
Body()(EchoController.prototype, "echo", 0)

class AppModule {}
Module({ imports: [DunasModule.forRoot({ billing })], controllers: [EchoController] })(AppModule)

const adapters = {
  express: () => new ExpressAdapter(),
  fastify: () => new FastifyAdapter(),
}

async function start(adapter: keyof typeof adapters) {
  const app = await NestFactory.create(AppModule, adapters[adapter](), { logger: false })
  app.setGlobalPrefix("api")
  await app.listen(0)
  onTestFinished(() => app.close())
  return (await app.getUrl()).replace("[::1]", "localhost")
}

function post(body: string) {
  return { method: "POST", headers: { "content-type": "application/json" }, body }
}

describe.each(Object.keys(adapters) as (keyof typeof adapters)[])(
  "DunasModule on %s",
  (adapter) => {
    it("hands the webhook body to dunas byte for byte, with Nest's body parser on", async () => {
      const url = await start(adapter)

      const response = await fetch(`${url}/api/dunas/webhooks/abacatepay`, post(webhookBody))

      expect(await response.json()).toEqual({
        path: "/api/dunas/webhooks/abacatepay",
        body: webhookBody,
      })
    })

    it("serves dunas at basePath without the global prefix", async () => {
      const url = await start(adapter)

      const response = await fetch(`${url}/api/api/dunas/plans`)

      expect(response.status).toBe(404)
    })

    it("leaves body parsing alone for the rest of the app", async () => {
      const url = await start(adapter)

      const response = await fetch(`${url}/api/echo`, post(webhookBody))

      expect(await response.json()).toEqual({
        body: { event: "transparent.completed", nome: "João" },
      })
    })
  },
)

class BillingEvents {
  received: string[] = []

  activated({ subscription }: DunasEvents["subscription.activated"]) {
    this.received.push(`activated ${subscription.planId}`)
  }

  charged({ charge }: DunasEvents["charge.created" | "charge.paid"]) {
    this.received.push(`charge ${charge.status}`)
  }
}
Injectable()(BillingEvents)
OnDunasEvent("subscription.activated")(
  BillingEvents.prototype,
  "activated",
  Object.getOwnPropertyDescriptor(BillingEvents.prototype, "activated") ?? {},
)
for (const type of ["charge.created", "charge.paid"] as const) {
  OnDunasEvent(type)(
    BillingEvents.prototype,
    "charged",
    Object.getOwnPropertyDescriptor(BillingEvents.prototype, "charged") ?? {},
  )
}

describe("@OnDunasEvent", () => {
  it("calls decorated provider methods when dunas emits the event", async () => {
    const { billing } = await setup()
    class EventsModule {}
    Module({ imports: [DunasModule.forRoot({ billing })], providers: [BillingEvents] })(
      EventsModule,
    )
    const app = await NestFactory.create(EventsModule, { logger: false })
    await app.init()
    onTestFinished(() => app.close())

    const result = await billing.subscribe({ customerId: "user_1", planId: "pro" })
    if (result.next.type === "none") {
      throw new Error("expected a pending payment")
    }
    await billing.simulatePayment({ chargeId: result.next.chargeId })

    expect(app.get(BillingEvents).received).toEqual([
      "charge pending",
      "charge paid",
      "activated pro",
    ])
  })
})
