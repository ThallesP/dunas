export const checkSnippet = `await billing.check({
  customerId,
  featureId: "messages",
})
// { allowed: true, balance: 4812 }`

export const typedIdSnippet = `billing.subscribe({ planId: "pr0" })`

export const nextSnippet = `// app/api/dunas/[...path]/route.ts
export const GET = billing.handler
export const POST = billing.handler`

export const nestSnippet = `import { All, Controller, Req, Res } from "@nestjs/common"
import type { Request, Response } from "express"
import { toNodeHandler } from "dunas/node"

@Controller("api/dunas")
export class DunasController {
  private readonly handler = toNodeHandler(billing.handler)

  @All("*path")
  handle(@Req() req: Request, @Res() res: Response) {
    return this.handler(req, res)
  }
}`

export const honoSnippet = `app.all("/api/dunas/*", (c) => billing.handler(c.req.raw))`

export const eventsSnippet = `createDunas({
  // …
  on: {
    "charge.created": ({ charge }) => sendEmail(charge),
    "subscription.canceled": ({ subscription }) => notifyChurn(subscription),
  },
})`
