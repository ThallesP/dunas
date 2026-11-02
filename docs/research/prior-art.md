# Prior art: PayKit and Autumn

Research date: 2026-10-19. Method: WebFetch/WebSearch only (docs, GitHub API listings, raw GitHub source). No signups, no browser tools.

Primary reference is **PayKit** (paykit.sh, `getpaykit/paykit`, npm `paykitjs`): an embedded, OSS billing library that runs in the app with the app's own Postgres. **Autumn** (useautumn.com, `useautumn/autumn`, npm `autumn-js`, CLI `atmn`) is a secondary reference, kept shorter, mostly for the concept model and the `attach` / `check` / `track` API. PayKit was inspired by Autumn.

Naming trap: `usepaykit/paykit-sdk` (usepaykit.dev, `@paykit-sdk/*`) is a different, unrelated project: a multi-provider payments toolkit (Stripe, Paystack, Polar, PayPal, ...). Everything below about "PayKit" is `getpaykit/paykit`.

Caveat on provenance: WebFetch summarizes pages through a small model, so signatures and code below are condensed reconstructions of the docs and source (identifiers and field names are as reported, long code blocks are paraphrased). Verify against the repo before copying anything verbatim. PayKit is MIT, Autumn is Apache-2.0.

---

## Part 1. PayKit (primary reference)

### 1.1 Snapshot

| | |
|---|---|
| Repo | github.com/getpaykit/paykit (MIT), about 1.1k stars, 953 commits, pnpm + Turborepo + Changesets + Vitest + oxlint |
| Package | `paykitjs` v0.2.0 (Sep 17, 2026). Pre-1.0, young (first release Apr 2026), changelog shows breaking changes at 0.0.3 and 0.0.4 |
| Author | maxktz (sponsored by Vercel credits, etc.) |
| Tagline | "The billing framework for TypeScript. Products in code, handles Stripe, webhooks, and usage state, runs in your app." |
| Providers | **Stripe only** (see 1.9). A Polar adapter existed for about a month (added May 4, removed Jun 2, 2026) and was removed |
| Frameworks | Next.js (`paykitjs/handlers/next`), TanStack Start, any Web-standard `Request`/`Response` framework via `paykit.handler`. Demo app uses Next.js + better-auth + tRPC |
| Self-description | Should read "like application code, not a hosted billing platform or a thin Stripe SDK wrapper" (AGENTS.md) |

### 1.2 Architecture: embedded library, not a hosted service (the key finding)

PayKit is an **embedded library**. It runs inside the user's app process, talks to the user's **own Postgres**, and talks to Stripe with the user's **own Stripe keys**. There is no PayKit cloud, no PayKit API key, no PayKit server to call. Evidence:

- Landing page: "runs inside your app", `database: env.DATABASE_URL`, "billing state stays in your infrastructure".
- Docs (Database page): billing state is in your Postgres, "No round-trips to Stripe on every `check()`". Entitlement checks are local SQL.
- `createPayKit({ database, stripe, products, ... })` is the whole backend. It returns an object with the API methods plus `handler(request) => Promise<Response>`.
- AGENTS.md: "uses the host application's own database. It has no separate datastore."

What actually runs where:

```
Browser --> paykitClient (typed fetch, paykitjs/client)
              |  POST /paykit/api/*   (identify() resolves the customer from the session)
              v
Your app server:  paykit.handler(request)   <-- mounted as a catch-all route /paykit/*
   |- better-call router (endpoints, zod input validation)
   |- core services: subscription / entitlement / customer / webhook / product-sync
   |- PaymentProvider (Stripe adapter)  --> Stripe API
   '- pg Pool --> your Postgres, tables prefixed paykit_*
Stripe --> POST /paykit/webhook --> same handler --> verify, dedupe, apply to DB, fire `on`
```

Lifecycle details from `core/create-paykit.ts`:
- `createPayKit` starts initialization eagerly (memoized `contextPromise`, with a no-op `.catch` so init failures do not become unhandled rejections; the error resurfaces when awaited).
- `database` is a connection string (turned into `new pg.Pool({ connectionString })`) or a `pg.Pool` you pass in.
- In non-production it runs a pending-migration guard (throws "run `paykitjs push`") and fire-and-forget dev checks (warns if plan config is out of sync with the DB).
- The instance is branded with `Symbol.for("paykit.instance")`.
- A `$infer` field (type-only) exposes `planId` / `featureId` unions.

**Database layer: no Prisma/Drizzle adapters for the user.** Internally PayKit uses `drizzle-orm` + `pg` (drizzle is a dependency, migrations are generated with drizzle-kit and shipped with the package), but the user-facing surface is only "connection string or `pg.Pool`". The docs do not document Drizzle/Prisma adapters, schema export into the user's own ORM, or foreign keys to the user's tables. The package does export `./database` (the drizzle schema), so a user could import it for typed joins, but this is undocumented. The user joins by convention: PayKit's `customer.id` is whatever string the app passes (user id or org id), so `paykit_customer.id = users.id` is a natural join. Tables are never to be written directly ("Use the PayKit API").

Migrations are applied by the CLI (`paykitjs push`), not at app boot. The dev guard just complains if they are pending. This is the same mental model as `prisma migrate deploy` in a deploy pipeline.

### 1.3 Concept model

| Concept | PayKit |
|---|---|
| Feature | `feature({ id, type })`, `type` is `"boolean"` or `"metered"`. Id: lowercase alnum, `-`, `_`, max 64 |
| Plan (a.k.a. product) | `plan({ id, name?, group?, default?, price?, includes? })`. Only `id` required. No `price` means free |
| Group | Plans in the same `group` are mutually exclusive: one active plan per group per customer. `default: true` allowed once per group and requires a group |
| Includes | Boolean feature: `proModels()`. Metered feature: `messages({ limit: 2000, reset: "month" })`. `reset` is `day`/`week`/`month`/`year`. `limit` is a positive integer |
| Price | `{ amount, interval }`, amount in major currency units (dollars), max 999,999.99, interval `month` or `year`. Currency is a global Stripe option (`usd`/`eur`) not per plan |
| Entitlement | A row per (customer, feature) created when a subscription row is inserted: `{ limit, balance, nextResetAt }`. Boolean features have null balance/limit |
| Balance | `balance` column is decremented by `report()`; `check()` reads it |
| Reset | **Lazy**: no cron. The next `check()`/`report()` after `nextResetAt` resets `balance = limit` and advances `nextResetAt` along period boundaries (UTC, month/year clamped to month end). No rollover |
| Usage tracking | `report({ customerId, featureId, amount })` decrements. It is a balance (remaining), not an event log. `usage` in `getCustomer` is derived (`limit - balance`) |
| Add-ons | Not a first-class concept. Docs mention an "addons" group only as an example. Open PR #204 adds `addOnPlanIds` + multi-item subscriptions + metered pricing (not merged as of research) |
| Trials | **Not implemented.** `trialDays` exists in the normalized plan but is always `null`; `trial_ends_at` column exists and `trialing` counts as active, but no caller sets it |
| Free plans | Yes: a plan without `price`. Default plan is auto-subscribed when `upsertCustomer` creates a customer |
| Prepaid credits / top-ups | **No** |
| Overage / usage-based billing to Stripe | **No.** Hard limit only: `report` returns `success: false` when balance is insufficient. Docs: only "a hard limit per period that blocks at zero, with flat-priced plans" |
| Credits | No |
| Proration | Delegated to Stripe on upgrade. `prorationBehavior` was removed from `subscribe` (commit b3234de) |
| Plan versioning | Yes. Each changed plan on `push` becomes a new row (`version+1`); old versions are never modified, so running deploys keep working |
| Invoices | Mirrored into `paykit_invoice` from webhooks |
| Payment methods | Mirrored into `paykit_payment_method` |

Plan change semantics (`subscribe`): upgrade (same group, higher `priceAmount`) is immediate with Stripe proration; downgrade is scheduled for period end (one pending change per group, a new one replaces the old); "cancel" = subscribe to the default free plan (there is **no** `cancel()` method); "resume" = subscribe to the current plan again to clear a pending change; same plan with nothing pending is a no-op.

### 1.4 How plans/features are declared and synced

Code-first, pure TypeScript, no DSL, no dashboard. Two modules by convention: `products.ts` and `paykit.ts`.

```ts
// products.ts
import { feature, plan } from "paykitjs"

const messages = feature({ id: "messages", type: "metered" })
const proModels = feature({ id: "pro_models", type: "boolean" })

export const free = plan({
  id: "free",
  group: "base",
  default: true,
  includes: [messages({ limit: 100, reset: "month" })],
})

export const pro = plan({
  id: "pro",
  group: "base",
  price: { amount: 19, interval: "month" },
  includes: [messages({ limit: 2_000, reset: "month" }), proModels()],
})
```

```ts
// paykit.ts
import { createPayKit } from "paykitjs"
import { free, pro } from "./products"

export const paykit = createPayKit({
  database: process.env.DATABASE_URL!,            // string or pg.Pool
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  },
  products: [free, pro],                          // array of plan(...) values
  basePath: "/paykit",                            // default
  identify: async (request) => {                  // resolves customer from session
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) return null
    return { customerId: session.user.id, email: session.user.email, name: session.user.name }
  },
  on: { "customer.updated": ({ payload }) => { /* ... */ } },
})
```

Design details worth copying (from `types/schema.ts`):
- `feature()` returns a **callable** (`messages({ limit, reset })`) that also carries `.id` and `.type`. Calling it returns a branded "include" object. Calling a boolean feature with config throws `Boolean feature "x" does not accept config`.
- `const` generics (`feature<const TId, const TType>`, `plan<const TConfig>`) preserve literal ids, so `paykit.$infer.planId` is `"free" | "pro"` and `featureId` is a union. `subscribe({ planId: "typo" })` is a compile error, on the client too.
- Everything is validated with zod at definition time, with consistent error text: `Invalid plan "pro":\n  - Price amount must be positive`. Brands via `Symbol.for("paykit.plan")` etc. so non-`plan()` values are rejected (`Includes must contain values returned by feature(...)`).
- Plans and includes are frozen. Option objects use an `ExactOptions<T>` helper that maps unknown keys to `never`, so typos in `createPayKit({...})` are compile errors.
- `normalizeSchema(products)` produces `NormalizedPlan[]` + `NormalizedPlanFeature[]`, sorted by id, with a content `hash` (SHA-256 of group, isDefault, price, features; id/name excluded).
- Display `name` defaults from the id (`pro_monthly` becomes "Pro Monthly").
- Cross-plan validations: duplicate plan ids, multiple defaults per group, same feature id with conflicting types, metered include without config.

CLI (`paykitjs`, uses commander + @clack/prompts):
| Command | What it does |
|---|---|
| `paykitjs init` | Interactive wizard: configures Stripe, generates `paykit.ts` (example plans), a route handler, optional client file. Auto-detects 13+ frameworks |
| `paykitjs push [-y]` | The main command. (1) applies pending DB migrations, (2) syncs plans to DB and Stripe (creates/updates Stripe Products and Prices). Run it in the deploy pipeline: `paykitjs push -y && next build` |
| `paykitjs status [--throw]` | Read-only validation: config validity, DB connection, migration status, Stripe connectivity, sync status. `--throw` exits 1 for CI |
| `paykitjs listen [--config p] [--retry 5m] [--forward-to url] [-- cmd]` | Dev webhook tunnel: registers a Stripe webhook endpoint, replays missed events, streams new ones, optionally wraps your dev server (`paykitjs listen -- pnpm dev`) |
- Config discovery: finds `paykit.ts` by default (`--config` override), loaded with `jiti`.
- Telemetry via posthog, opt out with `PAYKIT_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1`.

How `push` syncs (`product/product-sync.service.ts`):
1. Upsert all features.
2. For each plan: no stored row -> insert version 1 (action "created"); `planChanged` (group, isDefault, price, features compared positionally) -> insert version+1 ("created"); only name differs -> update name in place ("updated"); else "unchanged".
3. Paid plans (all three price fields set) are sent in one batch to `provider.syncProducts`, which creates the Stripe Product (metadata `paykit_product_id`) and Price. A price change reuses the Stripe product and creates a new price. Free plans never touch the provider.
4. Provider mapping `{ productId, priceId }` is stored per plan version.
5. `dryRunSyncProducts` does the same decision tree with no writes; used by dev checks and `status`.
- Rough edge: Stripe prices are never archived/deactivated; old prices accumulate.

### 1.5 Core API (server)

All methods take a single object arg and return a Promise. Defined with `definePayKitMethod`, which builds both the server-callable function and the HTTP endpoint (better-call) from one definition; methods flagged `client: true` are exposed to the browser client.

| Method | Input | Returns |
|---|---|---|
| `upsertCustomer` | `{ id, email?, name? }` | customer. New customers are auto-subscribed to the default plan |
| `getCustomer` | `{ id }` | customer + `subscriptions[]` + `entitlements` |
| `listCustomers` | `{ limit, offset, planIds }` | `{ data, total, hasMore }` |
| `deleteCustomer` | `{ id }` | removes customer, cancels Stripe subscriptions |
| `subscribe` | `{ customerId, planId, successUrl?, cancelUrl?, forceCheckout? }` | `{ paymentUrl, invoice, requiredAction }` |
| `customerPortal` | `{ customerId, returnUrl? }` | `{ url }` (Stripe billing portal) |
| `check` | `{ customerId, featureId }` | `{ allowed, balance? }` |
| `report` | `{ customerId, featureId, amount }` | `{ success, balance }` |
| `handleWebhook` | `{ body, headers }` | `{ received: true }` |
| `getTestClock`, `advanceTestClock` | only when `testing: { enabled: true }` | Stripe test clock helpers |

```ts
// subscribe: free plans activate immediately; paid with no saved card returns a Checkout URL
const r = await paykit.subscribe({
  customerId: "user_123", planId: "pro",
  successUrl: "https://myapp.com/billing/success", cancelUrl: "https://myapp.com/billing",
})
if (r.paymentUrl) redirect(r.paymentUrl)         // else: already active (or r.requiredAction for 3DS)

// getCustomer
// { id, email, name,
//   subscriptions: [{ planId, status, cancelAtPeriodEnd, currentPeriodStart, currentPeriodEnd }],
//   entitlements: { messages: { balance, limit, usage, unlimited, nextResetAt } } }

// check -> act -> report (recommended pattern; report only after success so failures are not charged)
const { allowed, balance } = await paykit.check({ customerId, featureId: "messages" })
// balance: { limit, remaining, resetAt, unlimited }   (absent for boolean features)
if (!allowed) return Response.json({ error: "Usage limit reached" }, { status: 403 })
const out = await generateChatResponse(input)
await paykit.report({ customerId, featureId: "messages", amount: 1 })  // { success, balance }
```

Client (`paykitjs/client`), types only from the server (`import type`), no server code bundled:
```ts
import { createPayKitClient } from "paykitjs/client"
import type { paykit } from "@/server/paykit"
export const paykitClient = createPayKitClient<typeof paykit>()   // optional { baseURL }

const { paymentUrl } = await paykitClient.subscribe({ planId: "pro", successUrl: "/billing/success", cancelUrl: "/billing" })
if (paymentUrl) window.location.href = paymentUrl
const { url } = await paykitClient.customerPortal({ returnUrl: window.location.href })
```
- Client has **only two methods** (`subscribe`, `customerPortal`). Neither takes `customerId`; the server's `identify()` supplies it. **No React hooks or components exist** (docs: "None are documented").
- Return URLs may be relative paths on the client (`/billing/success`); `returnUrl()` zod helper normalizes them against the trusted browser origin, rejects `//`, backslashes, encoded slashes, and non-http(s).

Entitlement internals (`entitlement.service.ts`), relevant if you copy the atomic-decrement design:
- `report` is one SQL statement with two CTEs: `active` computes the lazily-reset balance, `deducted` runs `UPDATE ... SET balance = balance - $amount WHERE id = (first row with balance >= amount) AND NOT EXISTS (unlimited row)`. Postgres row-locks and re-evaluates the predicate under concurrency, so balance cannot go negative.
- If the total is enough but no single entitlement row covers it (stacked rows from multiple subscriptions), it falls back to a transaction with `SELECT ... FOR UPDATE` and greedy deduction across rows.
- `check` is read-only and takes `required` (default 1). `check` then `report` is not atomic: two concurrent requests can both pass `check`; the safety is that `report` itself refuses to go negative. There is no reserve/lock primitive (Autumn has one).
- Noted inconsistencies in the source (potential bugs, do not copy blindly): the fast path decrements the stored (possibly stale) balance and does not persist the lazy reset; `limit` is read from two different columns on different paths; mixed DB `now()` and caller `now`.

### 1.6 Webhooks and state

- Endpoint: `${basePath}/webhook` (default `/paykit/webhook`), served by the same `paykit.handler` catch-all. Dev: `paykitjs listen`.
- Pipeline (`webhook.service.ts`):
  1. `provider.handleWebhook({ body, headers })` verifies the signature (`stripe.webhooks.constructEventAsync`) and **normalizes** the raw Stripe event into `NormalizedWebhookEvent[]`, each with `name`, `payload`, and `actions[]` (`subscription.upsert`, `invoice.upsert`, `payment.upsert`, `payment_method.upsert/delete`, `subscription.delete`).
  2. Dedup/claim: insert a row into `paykit_webhook_event` (`stripe_event_id` UNIQUE, `status: processing`, `trace_id: claimId`). On unique violation (`23505`) it may re-claim only if the existing row is `failed` or stuck in `processing` for more than 5 minutes; otherwise skip as duplicate.
  3. Business writes run in one DB transaction; the claim row is locked `FOR UPDATE` and re-verified (`trace_id === claimId`) to detect lost claims. Provider (Stripe API) calls needed for checkout completion happen **before** the transaction opens.
  4. Mark `processed`; on error mark `failed` with the stack, rethrow (so Stripe retries and the retry can re-claim).
  5. After commit: `emitCustomerUpdated` fires user `on` handlers, one per affected customer.
- Stripe events handled (10): `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.created/finalized/paid/payment_failed/updated`, `payment_method.detached`.
- User-facing events (`on`): the only documented/typed PayKit event is `customer.updated` with payload `{ customerId, subscriptions: [{ id, status, startedAt, endedAt, currentPeriodEndAt }] }`, plus a `"*"` wildcard `({ event }) => ...`. The landing page also shows `"subscription.activated"`, which does not appear in the docs/source `PayKitEventMap` (docs and marketing diverge). Handlers run inline after commit; a throwing handler's behavior is undocumented.
- State: subscriptions, entitlements/balances, invoices, payment methods, customer-to-Stripe-id map, webhook log all live in `paykit_*` tables in the app DB. Stripe remains the source of truth for money; PayKit mirrors state via webhooks and stores `stripe_*` ids per row.
- Security touches: `trustedOrigins` for cookie-authenticated mutations (CSRF-style Origin/Referer check), `identify()` is the trust boundary and an explicit `customerId` that disagrees with it gets `CUSTOMER_ID_MISMATCH`. Known open PR #221: unsigned replay header can skip signature verification in dev/test (an `allowUnsignedPayload` path); v0.2.0 hardened webhook claim ownership.

Database tables (10, `paykit_` prefix via drizzle `pgTableCreator`; consolidated from 17 in v0.0.3). Text ids, jsonb metadata, no ON DELETE actions:
`paykit_customer` (id = your id; `stripe_customer_id`, email/name/metadata + `stripe_synced_*` to diff what was pushed to Stripe, `deleted_at` soft delete, test-clock fields) · `paykit_feature` (id, type) · `paykit_product` (internal_id PK, id, version, group, is_default, price_amount/currency/interval, hash, stripe_product_id/price_id; UNIQUE (id, version)) · `paykit_product_feature` (product_internal_id, feature_id, limit, reset_interval, config) · `paykit_subscription` (customer_id, product_internal_id, status, canceled, cancel_at_period_end, period start/end, trial_ends_at, scheduled_product_id, quantity, stripe ids) · `paykit_entitlement` (subscription_id nullable, customer_id, feature_id, limit, balance, next_reset_at) · `paykit_invoice` (UNIQUE stripe_invoice_id/payment_id) · `paykit_payment_method` · `paykit_metadata` (checkout-session scoped scratch data with expiry) · `paykit_webhook_event`.

Concurrency weak spots admitted by the source: subscribe flow has no advisory locks or `FOR UPDATE`; provider calls run outside DB transactions so a DB failure after a Stripe call can desync; duplicate active subscriptions in a group are only logged. v0.2.0 notes "customer deletion and billing upserts are now race-safe" and adds unique indexes.

### 1.7 Provider interface (`providers/provider.ts`, about 5 KB, no comments)

A flat `PaymentProvider` interface, every method takes one `data` object and returns a Promise. The core never sees Stripe types, only `Provider*` and `Normalized*` shapes.

```ts
interface PaymentProvider {
  readonly id: string; readonly name: string
  // customers
  createCustomer(d: { id; email?; name?; metadata?; createTestClock? }): Promise<{ providerCustomer: ProviderCustomer }>
  updateCustomer(d: { providerCustomerId; email?; name?; metadata? }): Promise<void>
  deleteCustomer(d: { providerCustomerId }): Promise<void>
  // payment methods
  attachPaymentMethod(d: { providerCustomerId; returnURL }): Promise<{ url }>
  detachPaymentMethod(d: { providerMethodId }): Promise<void>
  // subscriptions
  createSubscriptionCheckout(d: { providerCustomerId; providerProduct: Record<string,string>; successUrl; cancelUrl?; metadata? }): Promise<{ paymentUrl; providerCheckoutSessionId }>
  createSubscription(d: { providerCustomerId; providerProduct }): Promise<ProviderSubscriptionResult>
  updateSubscription(d: { providerSubscriptionId; providerProduct }): Promise<ProviderSubscriptionResult>
  scheduleSubscriptionChange(d: { providerSubscriptionId; providerProduct?; providerSubscriptionScheduleId? }): Promise<ProviderSubscriptionResult>
  cancelSubscription(d: { providerSubscriptionId; currentPeriodEndAt?; providerSubscriptionScheduleId? }): Promise<ProviderSubscriptionResult>
  resumeSubscription(d: { providerSubscriptionId; providerSubscriptionScheduleId? }): Promise<ProviderSubscriptionResult>
  listActiveSubscriptions(d: { providerCustomerId }): Promise<{ providerSubscriptionId }[]>
  // invoices, products, portal
  createInvoice(d: { providerCustomerId; lines: { amount; description }[]; autoAdvance? }): Promise<ProviderInvoice>
  syncProducts(d: { products: { id; name; priceAmount; priceCurrency; priceInterval?; existingProviderProduct? }[] }): Promise<{ results: { id; providerProduct: Record<string,string> }[] }>
  createPortalSession(d: { providerCustomerId; returnUrl }): Promise<{ url }>
  // webhooks: verify + normalize
  handleWebhook(d: { body: string; headers: Record<string,string>; allowUnsignedPayload? }): Promise<NormalizedWebhookEvent[]>
  // test clocks
  getTestClock / advanceTestClock
  // optional: dev tunnel + diagnostics
  getTunnelAccount?() ; ensureTunnelWebhook?(d: { url; existingEndpointId? }) ; disableTunnelWebhook?(d) ; check?()
}
```
Notable abstraction choices: provider-specific ids are an opaque `Record<string,string>` (`providerProduct` = `{ productId, priceId }` for Stripe), which lets a provider with different object models (Polar, a Pix gateway) store whatever it needs. Webhook handling returns provider-neutral `NormalizedWebhookEvent`s carrying `actions`, so core applies state with no provider knowledge. Optional methods gate dev tooling (tunnel, preflight check).

### 1.8 Plugins

`PayKitPlugin = { id: string; endpoints?: Record<string, EndpointHandler> }`. Registered via `plugins: [dash()]`; endpoints mount under `/paykit/api/*`. The plugin must do its own auth (`createPayKitEndpoint` gives no automatic customer authentication; `definePayKitMethod({ requireCustomer: true })` opts in; `identify` is not run automatically for plugin endpoints). Only official plugin: `@paykitjs/dash` (a Vite React SPA served by the handler on `GET /paykit` with an `authorize(request)` option; public if omitted). No lifecycle hooks, no schema extension, no client-side plugin API are documented.

### 1.9 Provider history (important for "multi-provider" claims)

Timeline from commits and changelog: Mar 7 2026 Stripe provider base -> Apr 13 `PaymentProvider` interface extracted, Stripe moved to `@paykitjs/stripe` -> Apr 18 provider layer made pluggable (batch product sync, preflight checks) -> May 4 (v0.0.4) **Polar adapter added**, `plans` option renamed `products` (breaking) -> **Jun 2 commit "Remove Polar and make PayKit Stripe-only"** -> Jun 23 Stripe currency support. Current source: `provider` option is typed `never` and `@deprecated: "PayKit is Stripe-only. Use stripe instead."`; `AGENTS.md` says Stripe is the only provider. Some third-party pages (including a stale DeepWiki and one docs page) still advertise "Stripe, Polar, Creem, or your own", which is outdated. The interface still exists in source (`providers/provider.ts`) and the Stripe adapter lives in `src/stripe/stripe-provider.ts` (about 36 KB), so the seam is real but unsupported and not documented for third parties. Creem and Paddle were only ever "future".

Lesson: the maintainer built the multi-provider seam, shipped a second adapter, then retreated to Stripe-only. Plausible reasons (inference, not stated): the lowest-common-denominator model fights each provider's semantics (schedules, proration, checkout vs subscription objects), and each provider doubles the e2e matrix.

### 1.10 What makes PayKit's DX good

- Time to first working flow is short: `npx paykitjs init`, `paykitjs push`, mount one route file, call `subscribe`/`check`/`report`.
- Config is plain typed TS, no DSL, no dashboard; types flow everywhere (`$infer.planId`, client `planId` narrowing, `ExactOptions`).
- One definition yields server method + HTTP endpoint + typed client method (`definePayKitMethod`), so the client SDK is free and cannot drift.
- Local state means entitlement checks are one local query, joinable with app tables, no vendor outage dependency, no data lock-in (users call this out: "a really good abstraction without lock in", compared to better-auth).
- `identify()` as the single trust boundary, with the browser client never sending a `customerId`.
- Operational tooling is first-class: `status --throw` for CI, `listen` for local webhooks with replay, dev-time warnings when plan config drifts from the DB, `-y` for non-interactive deploys, test-clock mode.
- Docs ship `/llms.txt`, `/llms-full.txt`, per-page markdown (`/llms.md/docs/...`), "copy markdown" button and an AI assistant; AGENTS.md/CLAUDE.md in repo.
- Plan versioning that never mutates old versions makes rolling deploys safe.
- Typed error codes (`PayKitError`, `PAYKIT_ERROR_CODES`, `defineErrorCodes`) and pino logging with per-operation trace ids.

### 1.11 Rough edges / complaints (from source and issue tracker; few public complaints exist since it is young)

- Pre-1.0, breaking changes in 0.0.x; one review calls it still beta. v0.2.0 has a migration that dedupes billing rows before adding unique indexes.
- Feature coverage is thin: no trials, add-ons, credits, prepaid, overage/usage-billed pricing, or per-seat quantities in the public API (open PR #204 for add-ons/multi-item/metered). Currency only USD/EUR.
- No React hooks/components; client is just `subscribe` + `customerPortal`. No `cancel()`; cancel means "subscribe to free plan".
- Docs inconsistencies: import path `@/lib/paykit` vs `@/server/paykit`; landing page shows `subscription.activated` event that is not in the typed event map; installation page mentions `track()` and `report()` for usage; only Next.js and TanStack Start have copy-paste handlers (Hono/Express/Elysia unwritten, though `handler(request)` is Web-standard so they work).
- No Drizzle/Prisma integration for app-side typed access to billing tables; migrations are owned by PayKit's CLI, not merged into the app's migration history.
- `package.json` publishes raw `.ts` entry points in `exports` and `bin` while `files` only ships `dist` (build/publish rewrites presumably handle it; flagged by the analysis, unverified); `typescript` and `@types/pg` are runtime deps.
- Concurrency gaps in subscribe flow (no locks), provider calls outside transactions, `check`+`report` not atomic together, `forceCheckout` ignored on upgrades, entitlements created for scheduled subscriptions immediately with reset anchor = now.
- Security issue reported (PR #221) that `NODE_ENV` dev/test can skip signature checking via a magic header.
- Lazy reset means stale balance displays until next call (docs admit it).
- Stripe prices never archived on plan change.

---

## Part 2. Autumn (secondary reference, shorter)

### 2.1 Snapshot and architecture

- `useautumn/autumn`: Apache-2.0, YC F24, about 2.8k stars, Bun + Turborepo monorepo (`server/`, `apps/`, `packages/`, `shared/`), default branch `dev`. SDK `autumn-js`, CLI `atmn`, Python `autumn-sdk`.
- **Hosted service by default** (api.useautumn.com, app.useautumn.com): the app calls Autumn's REST API with an Autumn secret key (`am_sk_...`). Autumn "owns the customer state" (pricing, features, balances, credit ledgers, usage metering, gating). Stripe holds subscriptions, payments, invoices, Checkout, refunds. Autumn creates a Stripe Product/Price per plan (and per usage-priced feature), creates the Stripe webhook endpoint itself, and handles `checkout.session.completed`, `invoice.paid`, `invoice.created`, `customer.subscription.updated/deleted`. Your app does **not** receive Stripe webhooks; it optionally subscribes to Autumn's own webhooks (`billing.updated`, `balances.limit_reached`, `invoice.finalized`, auto top-up events, usage alerts) via Svix.
- Stripe account: every org gets a Stripe Connect sandbox automatically; production connects your own Stripe via OAuth or pasted secret key.
- **Self-hostable** (Apache-2.0; `bun install && bun dev`, own Postgres via `DATABASE_URL`) but the README says it "depends on a bunch of services" and points to Discord for help; not a lightweight embed. Bring-your-own data via "Lakehouse" (ClickHouse/BigQuery) and "export at any time".
- Latency mitigations because every check is a network call: fail-open SDK defaults (if Autumn is down users may get temporary extra access; tracked usage queued and replayed), an optional **edge cache in your own AWS account**, cache the customer object yourself, or sync via the `billing.updated` webhook. Claims 10k+ events/sec per end customer.
- Contrast with PayKit: Autumn = central hosted brain + your Stripe; PayKit = library + your DB + your Stripe.

### 2.2 Concept model

| Concept | Autumn |
|---|---|
| Feature | `type`: `boolean` / `metered` / `credit_system` / `ai_credit_system`. Metered has `consumable: true` (used up and refilled, e.g. messages) or `false` (persistent, e.g. seats/storage) |
| Plan | `planId`, `price { amount, interval }` (week/month/quarter/semi_annual/year/one_off), `items[]`, `group` (replace each other), `autoEnable` (free default), `addOn`, `freeTrial`, `variants`, `versionSlug`+`active` versioning |
| Plan item | `{ featureId, included, unlimited, reset: { interval }, price?, proration?, rollover?, thresholdBilling?, pooled? }`. `price.billingMethod` is `"usage_based"` (bill at period end) or `"prepaid"` (buy quantity upfront, draw down); flat `amount` or `tiers` (`graduated`/`volume`); `billingUnits` |
| Balance | One row per source per feature: `granted`, `remaining`, `usage`, `unlimited`, `overage_allowed`, `next_reset_at`, with `breakdown[]` per plan/add-on/top-up and `rollovers[]`. Balances stack; shorter intervals consumed first |
| Entitlements | Boolean features surface as `flag`; `check` returns `allowed` for boolean/unlimited/sufficient balance |
| Reset | Per item `reset.interval`; optional rollover with max and expiry |
| Overage | Per-feature `overage_allowed`, `usage_based` pricing, spend limits, `paydownOverages` setting, `overage_behavior: cap\|overflow` on `check` lock/`track` |
| Trials | `freeTrial { durationLength, durationType, cardRequired, onEnd: "bill"\|"revert" }`, abuse guard via customer `fingerprint` |
| Prepaid / credits | `prepaid` items, one-off add-on top-ups, auto top-ups (`billingControls.autoTopups`), `credit_system` (`creditSchema` maps metered features to credit cost, tiers, dimensions) and `ai_credit_system` (token markup over provider cost) |
| Extras | Entities (per-user/workspace balances under a customer), licenses/seats, rewards/coupons/referrals, custom per-customer plans (`customize`), invoice mode, tax, Stripe Tax, RevenueCat, multi-currency |

### 2.3 Declaring plans: `autumn.config.ts` + `atmn` CLI

Code-first config pushed to Autumn's server (dashboard is the alternative). Each list passed to `atmn({...})` is treated as complete: items missing from it are deleted on push.

```ts
// autumn/autumn.config.ts
import { atmn, feature, plan } from "atmn"

export const messages = feature({ featureId: "messages", name: "Messages", type: "metered", consumable: true })
export const sso = feature({ featureId: "sso", name: "SSO", type: "boolean" })

export const free = plan({
  planId: "free", versionSlug: "v1", active: true, name: "Free", autoEnable: true,
  items: [{ featureId: messages.featureId, included: 100, reset: { interval: "month" } }],
})

export const pro = plan({
  planId: "pro", versionSlug: "v1", active: true, name: "Pro",
  price: { amount: 20, interval: "month" },
  freeTrial: { durationLength: 14, durationType: "day", cardRequired: true },
  items: [
    { featureId: messages.featureId, included: 10000, reset: { interval: "month" },
      price: { amount: 1, billingUnits: 1000, interval: "month", billingMethod: "usage_based" } },
    { featureId: sso.featureId },
  ],
})

export const messageTopUp = plan({
  planId: "message_top_up", versionSlug: "v1", active: true, name: "Message Top-Up", addOn: true,
  items: [{ featureId: messages.featureId,
    price: { amount: 5, billingUnits: 1000, interval: "one_off", billingMethod: "prepaid" } }],
})

export default atmn({ features: [messages, sso], plans: [free, pro, messageTopUp] })
```
CLI: `atmn init` (connect, pull existing org data, install agent skills; `--keyless` creates an account-less sandbox), `atmn push` (preview) / `push --yes` / `--dry-run`, `atmn pull`, `atmn env`, `atmn reset` (sandbox only), `atmn sandbox ...`, `atmn api <group> <method> key=value`, `atmn skills install`. Sandbox by default, `-p/--prod` for production, `--headless` for CI/agents. Changing a plan version that has customers drafts a migration and prints a link rather than silently mutating subscribers.

### 2.4 Core API

Auth: secret key; REST uses snake_case, TS SDK camelCase; `x-api-version` header (default `2.6.0`).

```ts
import { Autumn } from "autumn-js"
const autumn = new Autumn({ secretKey: process.env.AUTUMN_SECRET_KEY! })

// customers (getOrCreate is idempotent; free plan with autoEnable attaches automatically)
const customer = await autumn.customers.getOrCreate({ customerId: user.id, name, email })
// customer: { id, name, email, subscriptions[], purchases, balances: { [featureId]: { granted, usage, remaining, ... } }, flags, ... }
// expand: invoices, entities, payment_method, subscriptions.plan, balances.feature, ...

// attach: new, upgrade, downgrade, add-on, one-off. Upgrade immediate, downgrade at end of cycle
const res = await autumn.billing.attach({
  customerId, planId: "pro", successUrl, redirectMode: "always", // always | if_required | never
  // optional: featureQuantities [{featureId, quantity}], freeTrial, customize {price, items...},
  //           invoiceMode, prorationBehavior, discounts, entityId, checkoutSessionParams, ...
})
// res: { customerId, paymentUrl | null, invoice?: {status, stripeId, total, currency, hostedInvoiceUrl},
//        requiredAction?: { code: "3ds_required" | "payment_method_required" | "payment_failed" | "payment_processing", reason } }
if (res.paymentUrl) redirect(res.paymentUrl)  // dry run: autumn.billing.previewAttach(...)

// check (read, optionally atomic consume) and track (write)
const { allowed, balance } = await autumn.check({ customerId, featureId: "messages", requiredBalance: 1 })
// balance: { featureId, granted, remaining, usage, unlimited, overageAllowed, nextResetAt, breakdown[], rollovers[] }
await autumn.check({ customerId, featureId, requiredBalance: 1, sendEvent: true })      // check+deduct atomically
await autumn.check({ customerId, featureId, requiredBalance: 5, lock: { enabled: true, lockId: "job_1", expiresAt } })
// later: balances.finalize (confirm or release the reservation)
await autumn.track({ customerId, featureId: "messages", value: 1 })          // negative value credits back
await autumn.track({ customerId, featureId, value: 1 }, { headers: { "Idempotency-Key": "req_abc" } })
// track is async/queued by default (202, balance null); pass async: false for the updated balance.
// optional: eventName (one event -> several features), properties (credit dimensions), entityId, overageBehavior cap|overflow

// cancel / change quantities: billing.update
await autumn.billing.update({ customerId, planId: "pro", cancelAction: "cancel_end_of_cycle" })
//   cancelAction: "cancel_immediately" (+ refundLastPayment: "prorated"|"full") | "cancel_end_of_cycle" | "uncancel"
await autumn.billing.update({ customerId, planId: "pro", featureQuantities: [{ featureId: "seats", quantity: 10 }] })

// portal, plans list (with per-customer eligibility), usage analytics
const { url } = await autumn.billing.openCustomerPortal({ customerId, returnUrl })
const { list } = await autumn.plans.list({ customerId })   // each plan: customerEligibility { attachAction: activate|upgrade|downgrade|purchase|none, status, trialAvailable }
const agg = await autumn.events.aggregate({ customerId, featureId: "messages", range: "30d" })
```
The older README/hook names (`attach({ productId })`, `check({ featureId })` returning `{ data }`, `track({ featureId, value })`) are the v1-era surface; the current API is `billing.attach`, `check`, `track`, `billing.update`, with `planId` replacing `productId`.

### 2.5 Framework and UI integrations

- Backend SDK: `autumn-js` (TS), `autumn-sdk` (Python), REST, MCP server. Handlers for Next/Hono/Express/Fastify/Elysia existed in the v1 `autumn-js` packages (mounted at `/api/autumn`); the current docs lead with the backend SDK instead.
- better-auth plugin: `autumn()` from `autumn-js/better-auth` creates customers on signup, assigns default plans, and exposes Autumn functions on `auth.api` (docs live on better-auth.com).
- React: `AutumnProvider`, `useCustomer()` (`customer`, `check`, `track`, `attach`, `checkout`, `openBillingPortal`), `usePricingTable()`, `<PricingTable />` and a shadcn-installable version, `AttachDialog`, `useEntity`, `useAggregateEvents`. Also Convex component.
- **Notable decision (July 29, 2026 blog, "Saying goodbye to React hooks"):** Autumn now recommends the backend SDK/API as the default. Reasons: client-side billing logic exposes credit schemas/markups to devtools and lets users call `attach` with internal plan ids; customers outgrew the prebuilt UI; coding agents do not benefit from hooks and multiple integration paths "bloat the context window". Hooks stay supported. Plan is one spec generating SDK, API, CLI and MCP.

### 2.6 What makes Autumn DX good, and rough edges

Good: three verbs (`attach`, `check`, `track`) cover most apps; pricing changes are config pushes with sandbox/prod separation and preview-before-apply; Stripe handled end to end including 3DS and failed payments via `requiredAction`; atomic `check`+`sendEvent`, reserve/finalize locks, idempotency keys, fail-open and edge cache for reliability; llms.txt, MCP server, bundled agent skills, `atmn api` for curl-style access; real-world pricing coverage (credits, prepaid, auto top-up, tiers, entities, rollover, trials).

Rough edges: it is a hosted dependency in the request path (latency, outage, vendor data ownership; mitigated, not eliminated); self-hosting is heavy; very large API surface (`attach` has dozens of options; snake_case REST vs camelCase SDK; `x-api-version` pinning); docs internally inconsistent in places (track `async` default described both ways); `productId` -> `planId`, hooks -> backend SDK show API churn; `autumn.config.ts` push semantics delete anything omitted from a list; switching Stripe accounts orphans customers.

---

## Part 3. Comparison and what to copy for a Pix-gateway TypeScript library (Woovi, AbacatePay)

| Dimension | PayKit | Autumn | Take for Pix |
|---|---|---|---|
| Architecture | Embedded lib, app's Postgres | Hosted API (self-host possible) | **Embedded** (matches your OSS goal) |
| Plan declaration | `feature()` / `plan()` in TS, `products: [...]` in `createPayKit` | `autumn.config.ts` with `atmn()`, pushed to server | PayKit style; sync = `push` into your own DB |
| Sync CLI | `init`, `push`, `status`, `listen` | `init`, `push`, `pull`, `env`, `reset`, `api` | `init`, `push`, `status`, `listen` |
| Entitlement check | local SQL | network call (+edge cache) | local SQL |
| Usage | `report` (decrement) | `track` (+ `check sendEvent`) | one atomic consume op |
| Provider abstraction | `PaymentProvider` interface, Stripe-only now | Stripe-only | needed from day one: Woovi + AbacatePay |

### Minimal API surface to copy

Server (all single-object args, all Promise-returning, all typed from config):
`createPayKit-like factory({ database, providers/woovi|abacatepay, products, identify, on, basePath, trustedOrigins })`,
`upsertCustomer`, `getCustomer`, `subscribe` (-> `{ paymentUrl, invoice, requiredAction }`), `check`, `report`, `handler(request)`; optional later: `customerPortal` (probably N/A for Pix), `listCustomers`, `deleteCustomer`.
Client: `createClient<typeof billing>()` with `subscribe` only to start; `customerId` never sent by the browser (resolved by `identify`).
CLI: `init`, `push -y`, `status --throw`, `listen`.
Events: `customer.updated` + `"*"`; add `payment.succeeded`, `payment.failed`, `subscription.*` as typed first-class events (PayKit's single event is thin).
Declarations: `feature({id,type})` callable that produces includes; `plan({id, group, default, price, includes})`; `const` generics for `$infer`.

### Pix-specific gaps neither product covers (design decisions for you, inference)

- Pix is push/one-shot, not a card-on-file subscription. Stripe renews automatically; Pix needs **your library to own the renewal clock**: generate a new charge (QR code / BR code / copia e cola) each period, hold the plan in a `past_due`/`pending` state until paid, grace period, dunning via `on` events. PayKit's `subscribe` returning `paymentUrl` maps to a "charge with QR" result; its `requiredAction` slot could carry the Pix payload. Pix Automático (BCB recurring Pix) is a separate rail that these gateways may or may not expose; check each gateway's docs before relying on it.
- Because there is no subscription object at the provider for Pix, the provider interface should not include `createSubscription/updateSubscription/scheduleSubscriptionChange` (Stripe-shaped); instead model `createCharge`, `getCharge`, `cancelCharge`, `refundCharge`, `handleWebhook` (verify + normalize), `syncProducts` (maybe a no-op), and put schedule/proration logic in core.
- Webhook verification differs per gateway (Woovi/AbacatePay signatures vs Stripe's); keep `handleWebhook(body, headers) -> NormalizedEvent[]` with `actions[]` exactly like PayKit so core stays provider-neutral, and keep PayKit's claim/dedupe/transaction/`FOR UPDATE`/stale-claim design.
- PayKit's retreat from multi-provider suggests starting with a narrow normalized model (charges, customers, webhooks) rather than mirroring Stripe subscriptions.
- Currency in centavos (integer) and BRL fixed; keep prices as integer minor units internally (PayKit stores `price_amount` in cents but accepts major units in `plan()`; consider accepting `{ amount: 1990 }` cents or a `brl()` helper to avoid float mistakes).
- Add the things PayKit lacks that Pix commerce will need soon: one-off/prepaid packs (credits via `report`-compatible balance top-ups), trials (cheap with Pix: no card), per-feature overage as hard-stop vs "buy more".
- Fix PayKit's weak spots by design: make `check`+consume atomic (`consume({ ..., required })` as Autumn's `sendEvent`), idempotency key on consume, advisory lock or `FOR UPDATE` in subscribe flows, persist lazy resets in the fast path, never skip signature verification based on `NODE_ENV`.

---

## Sources

PayKit: paykit.sh (landing, `/docs/introduction`, `installation`, `quickstart`, `plans-and-features`, `customers`, `subscriptions`, `entitlements`, `database`, `webhook-events`, `cli`, `client`, `plugins`, `typescript`, `metered-usage`, `/changelog`, `/llms-full.txt`); github.com/getpaykit/paykit (README, AGENTS.md, `packages/paykit/package.json`, `src/core/create-paykit.ts`, `src/types/{schema,events,instance,options,product}.ts`, `src/providers/provider.ts`, `src/stripe/stripe-provider.ts`, `src/database/schema.ts`, `src/entitlement/entitlement.service.ts`, `src/subscription/subscription.service.ts`, `src/product/product-sync.service.ts`, `src/webhook/webhook.service.ts`, `src/api/{methods,define-route}.ts`, `src/handlers/next.ts`, `src/index.ts`, `apps/demo/src/lib/paykit.ts`, `packages/paykit/CHANGELOG.md`, commit history of `providers/provider.ts`, PR list incl. #204, #221).

Autumn: useautumn.com and docs.useautumn.com (`llms.txt`, `documentation/concepts/{overview,stripe}.md`, `getting-started/{setup,gating,display-billing}.md`, `cli/{config,commands}.md`, `api-reference/billing/{attach,billingUpdate}.md`, `api-reference/core/{check,track}.md`, `api-reference/customers/getOrCreateCustomer.md`); github.com/useautumn/autumn (README); useautumn.com/blog/saying-goodbye-to-react-hooks; better-auth.com/docs/plugins/autumn and docs.useautumn.com/react/* (via web search results only, not read directly).

Not verified directly (flagged as such above): Autumn's current Node framework handler packages and the exact current `autumn-js` React export names (taken from search results/older docs); Autumn server source (only README and docs read, not `server/` code); Pix-gateway fit (analysis, not researched in this pass).
