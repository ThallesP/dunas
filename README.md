<img src="assets/icon.svg" width="64" height="64" alt="">

# dunas

Billing for Brazil that runs inside your app. Plans, usage limits and subscriptions paid by Pix, Pix Automático or card on top of **Woovi** and **AbacatePay**, with one API, your own Postgres and no billing server in between.

Inspired by [paykit](https://paykit.sh), which does this for Stripe.

```ts
const { allowed } = await billing.consume({ customerId: user.id, featureId: "messages" })
if (!allowed) return Response.json({ error: "Limite do plano atingido" }, { status: 402 })
```

## Why

Pix has no card on file. Every month someone has to create a new charge, show the QR code, wait for the payment, extend the period, and cut access when it isn't paid. Pix Automático and cards fix that, but only where the gateway has them turned on. dunas uses them when it can, falls back to a Pix every period when it can't, keeps entitlements in your database so `check` is one local query, and lets you put Woovi and AbacatePay behind the same API, picking one, rotating between them or failing over when one is down.

## Plans

```ts
// billing/plans.ts
import { feature, plan } from "dunas"

export const messages = feature({ id: "messages", type: "metered" })
export const seats = feature({ id: "seats", type: "metered" })
export const proModels = feature({ id: "pro_models", type: "boolean" })

export const free = plan({
  id: "free",
  default: true,
  includes: [messages({ limit: 100 }), seats({ limit: 1, reset: "never" })],
})

export const pro = plan({
  id: "pro",
  price: { amountInCents: 4_990, interval: "month" },
  includes: [messages({ limit: 5_000 }), seats({ limit: 10, reset: "never" }), proModels()],
})
```

- Metered limits reset every `month` by default (`day`, `week`, `year` or `never` also work).
- Plans in the same `group` (default `"base"`) replace each other. Plans in other groups stack, which is how add-ons work.
- Customers with no paid plan in a group get that group's `default` plan.
- Plan and feature ids are typed everywhere: `subscribe({ planId: "pr0" })` does not compile.

## Setup

```ts
// billing/dunas.ts
import { abacatepay, createDunas, pg, woovi } from "dunas"
import { fromBetterAuth } from "dunas/better-auth"
import { Pool } from "pg"
import { free, pro } from "./plans"

export const billing = createDunas({
  database: pg(new Pool({ connectionString: process.env.DATABASE_URL })),
  plans: [free, pro],
  providers: [
    woovi({ appId: process.env.WOOVI_APP_ID, methods: ["pix_automatico"] }),
    abacatepay({ apiKey: process.env.ABACATEPAY_API_KEY, webhookSecret: process.env.ABACATEPAY_WEBHOOK_SECRET, methods: ["card"] }),
  ],
  routing: "failover",
  identify: fromBetterAuth(auth),
  on: {
    "charge.created": ({ charge }) => sendPixEmail(charge),
    "subscription.canceled": ({ subscription }) => notifyChurn(subscription),
  },
})
```

Pix is always on. `methods` turns on what your gateway account has: `"pix_automatico"` on Woovi or AbacatePay, `"card"` on AbacatePay. `subscribe` only accepts what at least one provider turned on, and TypeScript checks that.

```ts
await billing.migrate()
await billing.registerWebhooks({ baseUrl: "https://myapp.com" })
```

Mount the handler on one route. It serves the browser client, the gateway webhooks and the renewal cron:

```ts
// app/api/dunas/[...path]/route.ts (Next.js)
export const GET = billing.handler
export const POST = billing.handler
```

```ts
// Hono, Bun, Deno, anything with Request/Response
app.all("/api/dunas/*", (c) => billing.handler(c.req.raw))
```

```ts
// NestJS: app.module.ts, serves basePath before Nest's body parser, so no rawBody
import { DunasModule } from "dunas/nestjs"

@Module({ imports: [DunasModule.forRoot({ billing })] })
export class AppModule {}
```

Plain Node and Express use the same adapter: `createServer(toNodeHandler(billing.handler))`, or `app.use("/api/dunas", toNodeHandler(billing.handler))` before `express.json()`.

## Server API

Customers are created the first time you use their id, on the default plan. Add details whenever you have them (they are sent with Pix charges):

```ts
await billing.upsertCustomer({ id: user.id, taxId: "529.982.247-25", phone: "(11) 99999-9999" })
```

```ts
const { subscription, next } = await billing.subscribe({ customerId, planId: "pro" })
// next: { type: "redirect", url, chargeId }   pay on the gateway's page (the default)
// next: { type: "none" }                      free plans, already subscribed, or back to the default plan at period end

await billing.subscribe({ customerId, planId: "pro", method: "pix", checkout: "embedded" })
// next: { type: "pix", brCode, qrCodeImageUrl, expiresAt, chargeId }   show the QR code yourself

await billing.check({ customerId, featureId: "pro_models" })           // { allowed }
await billing.check({ customerId, featureId: "messages", required: 5 }) // { allowed, balance }
await billing.consume({ customerId, featureId: "messages" })          // records only if allowed
await billing.track({ customerId, featureId: "messages", amount: 3 })   // always records
await billing.track({ customerId, featureId: "seats", amount: -1 })     // give a seat back

const { balances, flags, subscriptions } = await billing.getCustomer({ customerId })
balances.messages // { limit, used, remaining, resetsAt }
flags.pro_models  // boolean

await billing.cancel({ customerId, planId: "pro" }) // at period end, or { immediately: true }
```

Boolean features only take `check`, and every id is typed from your plans.

### Pricing page

`listPlans` returns your plans with what the button should do for this customer, so the page has no billing logic:

```tsx
const plans = await billing.listPlans({ customerId })

plans.map(({ id, name, price, action }) => <PlanCard key={id} name={name} price={price} action={action} />)
// action: "current" | "upgrade" | "downgrade" | "subscribe" | "resume" | "pending_payment" | "scheduled"
```

`consume` and `track` take an `idempotencyKey` so retried requests count once.

## Browser client

```ts
import { createDunasClient } from "dunas/client"
import type { billing } from "@/billing/dunas"

const dunas = createDunasClient<typeof billing>()

const plans = await dunas.listPlans()

const { next } = await dunas.subscribe({ planId: "pro", successUrl: `${location.origin}/thanks` })
if (next.type === "redirect") location.href = next.url
```

The default is the shortest path: the gateway's page, with Pix Automático when a provider has it. `method` (`"pix"`, `"pix_automatico"`, `"card"`) and `checkout: "embedded"` give you more control, like a QR code inside your own page with `waitForPayment({ chargeId: next.chargeId })`, and are what your coding agent can build on.

The browser never sends a customer id. `identify` decides who the customer is.

## Renewals

Call `billing.runRenewals()` once an hour, or point your cron at `/api/dunas/renewals` with `Authorization: Bearer $CRON_SECRET` (GET for Vercel Cron, or POST). It:

1. creates the next Pix charge `renewDaysBefore` days (default 3) before the period ends and fires `charge.created`, so you can send it to the customer,
2. extends the period when that charge is paid (`subscription.renewed`),
3. marks unpaid subscriptions `past_due` when the period ends, keeping access for `graceDays` (default 3),
4. cancels them after the grace period (`subscription.canceled`), and the customer falls back to the default plan.

Subscriptions on Pix Automático or card are renewed by the gateway. dunas records each debit from the webhook and extends the period the same way. If the customer revokes Pix Automático or a debit fails, the subscription keeps going on Pix renewals and fires `subscription.method_changed`.

Access is computed from the dates, so a late cron never gives away extra days.

## Routing between gateways

```ts
routing: "failover"                                   // first provider, next one if it errors (default)
routing: "round-robin"
routing: { weights: { woovi: 70, abacatepay: 30 } }
routing: ({ amountInCents }) => (amountInCents > 50_000 ? "woovi" : "abacatepay")
```

Webhooks are only a signal: dunas verifies them, then reads the charge back from the gateway before changing anything.

## Testing

`billing.simulatePayment({ chargeId })` pays a Pix charge in Woovi sandbox or AbacatePay dev mode (embedded checkout only on AbacatePay). Pix Automático and card can't be simulated through the API. For unit tests use PGlite:

```ts
import { PGlite } from "@electric-sql/pglite"
import { pglite } from "dunas"

const billing = createDunas({ database: pglite(new PGlite()), plans, providers, now: () => clock.now })
```

## Status

Early. Not yet: proration on upgrades, trials, refunds, boleto, changing the payment method of a running subscription.

## Community

Questions, ideas or just want to talk? Come say hi on [Discord](https://discord.gg/pF5wfWZMSH).
