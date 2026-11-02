# AbacatePay API: implementation-grade research

Research date: 2026-10-19. Method: official docs only (docs.abacatepay.com, the `AbacatePay/documentation` repo including `openapi.yaml` and `openapi-v1.yaml`, and the `AbacatePay/ecosystem` monorepo with the official TypeScript types/SDK). No account was created, no browser tools were used.

Conventions in this file:

- **UNVERIFIED** = could not be confirmed from an official source, or sources conflict. Treat as a risk.
- **INFERRED** = deduced from SDK/type source or from examples, not stated in prose by the docs.
- "Docs" = pages under `https://docs.abacatepay.com/pages/...`. The MDX sources live at `https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/...` (same paths, `.mdx`).
- Full machine-readable specs: v2 `https://raw.githubusercontent.com/AbacatePay/documentation/main/openapi.yaml` (213 KB), v1 `https://raw.githubusercontent.com/AbacatePay/documentation/main/openapi-v1.yaml` (47 KB). Docs index: `https://docs.abacatepay.com/llms.txt` (exists).
- Official TS types (the most precise source for payload shapes): `https://github.com/AbacatePay/ecosystem/tree/main/packages/types/types` (`v1/`, `v2/`).

---

## 0. TL;DR (what a billing library must know)

| Topic | Answer |
|---|---|
| Current API | **v2**, `https://api.abacatepay.com/v2`. GA since 2026-04-20 (beta from 2026-03-06). Source: [changelog](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/changelog/index.mdx) |
| v1 | `https://api.abacatepay.com/v1`. **Legacy**, still works, sunset announced for **2028-03-01**. All new features are v2-only. Source: [v1 intro](https://docs.abacatepay.com/pages/v1/introduction), changelog |
| Auth | `Authorization: Bearer <API key>`. Same host for dev and prod; the **key** selects the environment. |
| Money | Integer **centavos** (BRL). Percent values are in hundredths of a percent (`1000` = 10%). |
| Response envelope | v2: `{ "data": ..., "success": boolean, "error": string \| null }` |
| Native subscriptions | **Yes, v2 only** (card; Pix via "Pix Automatico" if enabled on the store). Product with `cycle` -> subscription **checkout** -> paid -> subscription. |
| Dev-mode Pix simulation | `POST /v2/transparents/simulate-payment?id=pix_char_...` (v1: `POST /v1/pixQrCode/simulate-payment?id=...`). Works for transparent Pix charges only. |
| Webhook registration | API (`POST /v2/webhooks/create`) **and** dashboard |
| Webhook auth | Legacy: `?webhookSecret=<your secret>` in URL + `X-Webhook-Signature` = base64(HMAC-SHA256(raw body, AbacatePay's fixed public key)). Newer endpoints may use Standard Webhooks (see section 8.3, **UNVERIFIED** signature details). |
| Node SDK | `@abacatepay/sdk` v3.0.0 (2026-10-12), maintained. Old `abacatepay-nodejs-sdk` is **deprecated**. |
| Production | Requires a **CNPJ** (MEI/ME accepted, CPF not). Review up to 3 business days. |

---

## 1. Base URLs, auth, environments, limits, units

### 1.1 Base URLs and versions

- v2: `https://api.abacatepay.com/v2` (OpenAPI `servers`: "single server for production and sandbox"). Source: [API intro v2](https://docs.abacatepay.com/pages/reference/introduction), [openapi.yaml](https://raw.githubusercontent.com/AbacatePay/documentation/main/openapi.yaml)
- v1: `https://api.abacatepay.com/v1`. Source: [v1 intro](https://docs.abacatepay.com/pages/v1/introduction), [openapi-v1.yaml](https://raw.githubusercontent.com/AbacatePay/documentation/main/openapi-v1.yaml)
- Hosted checkout pages: `https://app.abacatepay.com/pay/<bill_id>` (v2 examples). A v1 OpenAPI example shows `https://pay.abacatepay.com/bill-5678` (example text only; treat the `url` field in responses as opaque).

### 1.2 Authentication

- Header: `Authorization: Bearer <API_KEY>` (exactly one space, no quotes). Missing/invalid/revoked key -> HTTP 401. Source: [Authentication](https://docs.abacatepay.com/pages/authentication)
- Verify a key cheaply with `GET /v2/stores/get`. Source: same page.
- Keys are created in the dashboard (Integracao -> API Keys). Permissions (scopes) are fixed at creation and **cannot be edited**; to change access create a new key. 403 body: `Insufficient permissions`.
- Scopes (v2) and the routes they gate. Source: [Authentication](https://docs.abacatepay.com/pages/authentication):

| Scope | Routes |
|---|---|
| `CHECKOUT:CREATE` | `POST /checkouts/create`, `POST /payment-links/create` |
| `CHECKOUT:READ` | `GET /checkouts/get`, `/checkouts/list`, `/payment-links/get`, `/payment-links/list` |
| `CHECKOUT:DELETE` | `POST /checkouts/delete`, `/payment-links/delete` |
| `REFUND:CREATE` | `POST /checkouts/refund`, `/payment-links/refund`, `/transparents/refund` |
| `TRANSPARENT:CREATE` | `POST /transparents/create`, `/transparents/simulate-payment` |
| `TRANSPARENT:READ` | `GET /transparents/get`, `/list`, `/check` |
| `SUBSCRIPTION:CREATE` | `POST /subscriptions/create`, `/change-plan`, `/record-usage` |
| `SUBSCRIPTION:READ` | `GET /subscriptions/get`, `/list`, `/checkouts/get`, `/checkouts/list` |
| `SUBSCRIPTION:DELETE` | `POST /subscriptions/cancel`, `/subscriptions/checkouts/delete` |
| `CUSTOMER:CREATE/READ/DELETE` | `POST /customers/create`, `GET /customers/get,list`, `POST /customers/delete` |
| `PRODUCT:CREATE/READ/DELETE` | `POST /products/create`, `GET /products/get,list`, `POST /products/delete` |
| `COUPON:CREATE/READ/UPDATE/DELETE` | `POST /coupons/create`, `GET /coupons/get,list`, `POST /coupons/toggle` (UPDATE), `POST /coupons/delete` |
| `WEBHOOK:CREATE/READ/DELETE` | `POST /webhooks/create`, `GET /webhooks/get,list`, `POST /webhooks/delete` |
| `WITHDRAW:CREATE/READ` | `POST /payouts/create`, `POST /pix/send`; `GET /payouts/get,list`, `GET /pix/get,list` |
| `STORE:READ` | `GET /stores/get`, `/stores/list` |
| `BANK_STATEMENT:READ` | `GET /bank-statement/list` |

Note: the v2 HTTP verbs are only `GET` and `POST`. Deletes and toggles are `POST` (SDK 2.0.0 changelog: "Some delete and toggle calls now use POST"). For deletes the `id` goes in the **query string** (SDK 3.0.0 changelog: delete calls "used to fail with 422" when sending the id elsewhere; OpenAPI for `POST /webhooks/delete` also says `id` is a query param). Docs pages for `/customers/delete`, `/coupons/toggle`, `/subscriptions/checkouts/delete` do not state where `id` goes: **UNVERIFIED for those three**, assume query `?id=`.

### 1.3 Dev mode vs production

- Dev mode is the sandbox. **Same base URL**; the key picks the environment ("O ambiente e definido pela chave utilizada"). New accounts start in dev mode. Sources: [Dev mode](https://docs.abacatepay.com/pages/devmode), [Authentication](https://docs.abacatepay.com/pages/authentication)
- Every response includes `devMode: boolean` (`true` = sandbox). Use this as the library's environment oracle.
- Key prefixes: [Production page](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/production.mdx) says dev keys start with `abc_dev_` and prod keys with `abc_prod_`; the [Authentication page](https://docs.abacatepay.com/pages/authentication) says no prefix is documented. Treat prefix sniffing as **UNVERIFIED**; rely on the `devMode` response field instead.
- The public key for the browser card form (abacatepay.js) is `pk_...`. It is separate from the API key and safe in the browser. Source: [Authentication](https://docs.abacatepay.com/pages/authentication)
- Dev webhooks and prod webhooks are separate resources; **recreate webhooks in production** after going live. Source: [Production](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/production.mdx)
- Dev-mode data does not carry over to production (the docs do not state a migration; treat as non-portable). Withdrawals (payouts/Pix send) are production-only per the production page.
- Production requirements: valid **CNPJ** (MEI and ME accepted; CPF individuals not served), live website with terms/privacy/contact/CNPJ in footer, managing-partner data. Review "up to 3 business days". Source: [Production](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/production.mdx), [FAQ](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/faq/index.mdx)
- Card payments may need enabling per store: error `CARD_TRANSPARENTS is not available for this store` (card guide). Subscriptions via Pix and multi-product subscriptions are also feature-gated (section 5).

### 1.4 Rate limits

- **No global numeric rate limit is documented.** HTTP 429 exists. Source: [API intro v2](https://docs.abacatepay.com/pages/reference/introduction)
- Documented per-endpoint throttles:
  - `POST /payouts/create`: docs say "one withdrawal per minute" (429 on excess) ([payouts reference](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/payouts/reference.mdx)); the TS types comment says "one payout per store every 30 seconds" ([types rest.ts](https://raw.githubusercontent.com/AbacatePay/ecosystem/main/packages/types/types/v2/rest.ts)). **Conflict; assume the stricter (60 s).**
  - `POST /pix/send`: "one transfer per store every 30 seconds" (types comment).
  - `externalId` is **not** an idempotency key on payouts/Pix send.
- Caching: `GET /stores/get` may be cached up to 1 hour (types comment); `GET /transparents/check` is not cached (poll this for Pix status); checkout lookups were cached 1 hour, reduced to 60 s on 2026-09-23 ([changelog](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/changelog/index.mdx)).
- 5xx guidance: retry with exponential backoff (1 s, 2 s, 4 s...). The official SDK 3.0.0 only retries `GET` on timeout/5xx and other methods only on 429, "because a retried card charge, payout or PIX transfer could charge or send money twice" ([SDK changelog](https://raw.githubusercontent.com/AbacatePay/ecosystem/main/packages/sdk/CHANGELOG.md)). Copy that policy.

### 1.5 Units, types, IDs

- `amount`, `price`, `paidAmount`, `platformFee`, `balance.*`: **integer centavos** (`1000` = R$ 10,00). Never decimals. Source: [API intro v2](https://docs.abacatepay.com/pages/reference/introduction)
- Percentage values (`interest.value`, percentage `fine.value`, percentage coupon `discount`): hundredths of a percent (`100` = 1%, `1000` = 10%, max `10000`). `FIXED` fine/discount values are centavos.
- Currency: always `BRL` (products carry `currency: "BRL"`; subscription webhook has `currency: "BRL"`).
- Dates: ISO 8601 UTC in responses; query filters `startDate`/`endDate` are `YYYY-MM-DD`, inclusive, interpreted in **America/Sao_Paulo**.
- ID prefixes (compiled from docs/OpenAPI/fixtures):

| Prefix | Resource |
|---|---|
| `cust_` | customer |
| `prod_` | product |
| `bill_` | checkout / payment link / subscription checkout (all "billing") |
| `subs_` | subscription |
| `subu_` | pending subscription plan update |
| `usgr_` | subscription usage record |
| `pix_char_` | transparent Pix charge (v1 Pix QR code too) |
| `card_` | transparent card charge |
| `bole_` | transparent boleto |
| `char_` | generic payment intent (also in subscription webhook `payment.id`) |
| `tran_` | ledger transaction (payout, Pix send, refund) |
| `webh_` | webhook endpoint |
| `log_` | webhook delivery id (the envelope `id`) |
| `store_` | store |
| `cinst_` | card installment group |
| `ctok_` | single-use card token (60 s) |
| `intl_` | subscription installment id (fixture only; INFERRED) |
| coupon `id` | equals the coupon `code` |

### 1.6 Envelope, pagination, filtering

- v2 success: `{ "data": {...}, "success": true, "error": null }`. Error: `{ "data": null, "success": false, "error": "message or CODE" }`. The docs say to check `success`, not only the HTTP status. Source: [API intro v2](https://docs.abacatepay.com/pages/reference/introduction)
- A 401 from the OpenAPI is `{ "error": "Token de autenticacao invalido ou ausente." }` (no `data`/`success`), so parse defensively.
- v1 envelope: `{ "data": ..., "error": null }` (OpenAPI v1; the v1 intro page also mentions `success`). Source: [openapi-v1.yaml](https://raw.githubusercontent.com/AbacatePay/documentation/main/openapi-v1.yaml)
- v2 pagination is **cursor-based** on all `*/list` routes (except `/pix/list`, which "does not paginate or accept filters"):
  - Query: `limit` (1..100, default 100), `after` (pass `pagination.next`), `before`, `startDate`, `endDate`.
  - Response adds `"pagination": { "hasMore": true, "next": "cust_abc123", "before": null }`. Newest first.
  - **Gotcha:** types comment says treat `next !== null` as the "more pages" signal, not `hasMore` ("some API traffic sets `hasMore` true even when only newer items exist"). Source: [types rest.ts](https://raw.githubusercontent.com/AbacatePay/ecosystem/main/packages/types/types/v2/rest.ts)
- v1 `list` endpoints return plain arrays with no documented pagination.
- Lookup routes (`/checkouts/get`, `/subscriptions/get`, ...) require at least one of `id`, `externalId`, `customerId`; otherwise error `Provide id, externalId or customerId`. If several match, the most recent is returned (SDK note, INFERRED for other resources).
- Request idempotency: there is **no `Idempotency-Key` header**. Partial substitutes via `externalId` (INFERRED from type doc comments in [rest.ts](https://raw.githubusercontent.com/AbacatePay/ecosystem/main/packages/types/types/v2/rest.ts)):
  - `POST /checkouts/create` with an existing `externalId` returns the existing checkout unchanged.
  - `POST /subscriptions/create` with an existing `externalId` returns the existing billing.
  - `POST /transparents/create` (Pix) with an `externalId` of a `PENDING` charge returns that charge. (`externalId` is ignored for card charges.)
  - Payouts/Pix send: `externalId` is not idempotent.
  - Card timeouts: do NOT blindly retry; query list/get or wait for the webhook (card guide).

---

## 2. Billing / checkout

### 2.1 v2: `/checkouts/*` (renamed from v1 `/billing/*`)

Docs: [reference](https://docs.abacatepay.com/pages/payment/reference), [create](https://docs.abacatepay.com/pages/payment/create), [get](https://docs.abacatepay.com/pages/payment/one), [list](https://docs.abacatepay.com/pages/payment/list), [installments](https://docs.abacatepay.com/pages/payment/installments).

**Big model change vs v1:** v2 checkouts do **not** accept inline products. `items` reference products that already exist (`POST /products/create`). The `items[].id` may be the product `id` or its `externalId` (types comment). The library must create/sync products first.

#### `POST /v2/checkouts/create` (scope `CHECKOUT:CREATE`)

Body (`additionalProperties: false`; only `items` is required). Sources: [create page](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/payment/create.mdx), [types rest.ts](https://raw.githubusercontent.com/AbacatePay/ecosystem/main/packages/types/types/v2/rest.ts).

| Field | Type | Notes |
|---|---|---|
| `items` | `{ id: string, quantity: integer>=1 }[]` | **required**, min 1. "Always send `quantity`: the API does not apply its default." |
| `customerId` | string | optional existing customer |
| `externalId` | string | your reference; reuse returns the existing checkout |
| `returnUrl` | uri | where the "Voltar" (back) button goes |
| `completionUrl` | uri | redirect after payment |
| `methods` | `("PIX"\|"CARD"\|"BOLETO")[]` | default `["PIX","CARD"]`. CARD must be enabled on the store if you rely on the default. |
| `coupons` | string[] (max 50) | coupon codes |
| `card` | `{ maxInstallments: 1..12 }` | requires `CARD` in `methods`; each installment >= R$ 10,00 |
| `upSellProductId` | string | must be `ACTIVE` and have no `cycle` |
| `dueDate` | `YYYY-MM-DD` | BOLETO only; default 3 business days; max 365 days ahead; not in the past |
| `interest` | `{ value: int>=0 }` | BOLETO only; hundredths of a percent |
| `fine` | `{ value: int>=0, type: "PERCENTAGE"\|"FIXED" }` | BOLETO only |
| `metadata` | object | free-form |
| `frequency` | `"ONE_TIME"` (default) | listed on the reference page as optional; the create page/OpenAPI body does not list it. **UNVERIFIED** whether it is accepted. Use `/payment-links/create` for reusable links and `/subscriptions/create` for subscriptions. |

Hosted-URL flags you can append to the returned `url`: `?skip_customer=true`, `skip_address=true` (also `1`). They hide steps, disable upsell and confirmation email, hide Boleto/Apple Pay/Google Pay (unless boleto is the only method) and do not work for subscriptions. Source: [reference](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/payment/reference.mdx), changelog 2026-10-16.

Example:

```json
POST /v2/checkouts/create
{
  "items": [{ "id": "prod_abc123xyz", "quantity": 1 }],
  "customerId": "cust_abc123xyz",
  "externalId": "pedido-123",
  "methods": ["PIX", "CARD"],
  "returnUrl": "https://example.com/back",
  "completionUrl": "https://example.com/done",
  "card": { "maxInstallments": 3 },
  "metadata": { "origem": "app-mobile" }
}
```

Response (`data` is the Checkout object; field list from the OpenAPI `Billing` component and the reference page; example values INFERRED from docs/fixtures):

```json
{
  "data": {
    "id": "bill_abc123xyz",
    "externalId": "pedido-123",
    "url": "https://app.abacatepay.com/pay/bill_abc123xyz",
    "amount": 10000,
    "paidAmount": null,
    "items": [{ "id": "prod_abc123xyz", "quantity": 1 }],
    "status": "PENDING",
    "coupons": [],
    "devMode": false,
    "customerId": "cust_abc123xyz",
    "returnUrl": "https://example.com/back",
    "completionUrl": "https://example.com/done",
    "receiptUrl": null,
    "metadata": { "origem": "app-mobile" },
    "upSellProductId": null,
    "installmentsCount": null,
    "dueDate": null,
    "interest": null,
    "fine": null,
    "createdAt": "2026-10-01T12:00:00.000Z",
    "updatedAt": "2026-10-01T12:00:00.000Z"
  },
  "success": true,
  "error": null
}
```

Additional checkout fields seen in webhook payloads: `methods`, `frequency`, `platformFee`, `trialDays`, `trialEndsAt`, `nextChargeAt`, `card.maxInstallments`, `payerInformation`, `utms`.

**Checkout `status`**: `PENDING`, `PAID`, `EXPIRED`, `CANCELLED`, `REFUNDED` (OpenAPI/docs). The webhook TS type additionally allows `UNDER_DISPUTE`, `ACTIVE`, `REDEEMED`. Payment links show `ACTIVE`. Boleto without interest/fine becomes `EXPIRED` after the due date.

**`frequency`** values: `ONE_TIME` (checkouts), `MULTIPLE_PAYMENTS` (payment links), `SUBSCRIPTION` (subscription checkouts).

#### Get / list / delete

- `GET /v2/checkouts/get?id=` (or `externalId`, or `customerId`; at least one required). Does **not** return subscription checkouts (error `This is a subscription checkout. Use /v2/subscriptions/checkouts/get`). Since 2026-09-23.
- `GET /v2/checkouts/list` (`CHECKOUT:READ`): only `ONE_TIME` checkouts. Params: `limit, after, before, startDate, endDate, status` (docs describe status as "pending, paid or canceled"; exact enum **UNVERIFIED**, use the Checkout status values) and a `method` filter (changelog says `method=PIX` now also matches multi-method checkouts).
- `POST /v2/checkouts/delete` (`CHECKOUT:DELETE`): does not delete subscription checkouts any more.
- Payment links (reusable, `frequency: "MULTIPLE_PAYMENTS"`): `POST /v2/payment-links/create`, `GET /v2/payment-links/get|list`, `POST /v2/payment-links/delete`, `POST /v2/payment-links/refund`. Body like checkout create (`items` required; no `customerId` support, response `customerId: null`). Source: [payment-links reference](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/payment-links/reference.mdx), OpenAPI.

### 2.2 v1: `/billing/*` (legacy)

Source: [openapi-v1.yaml](https://raw.githubusercontent.com/AbacatePay/documentation/main/openapi-v1.yaml), [old Node SDK README](https://github.com/AbacatePay/abacatepay-nodejs-sdk).

`POST /v1/billing/create` (`additionalProperties: false`):

```json
{
  "frequency": "ONE_TIME",
  "methods": ["PIX"],
  "products": [
    { "externalId": "prod-1234", "name": "Assinatura Premium", "description": "Acesso total", "quantity": 1, "price": 10000 }
  ],
  "returnUrl": "https://example.com/billing",
  "completionUrl": "https://example.com/completion",
  "customerId": "cust_abcdefghij",
  "customer": { "name": "Daniel Lima", "cellphone": "(11) 4002-8922", "email": "daniel_lima@abacatepay.com", "taxId": "111.444.777-35" },
  "allowCoupons": false,
  "coupons": [],
  "externalId": "pedido-123",
  "metadata": {}
}
```

- Required: `frequency` (`ONE_TIME` | `MULTIPLE_PAYMENTS`, default `ONE_TIME`), `methods` (`PIX` | `CARD`, 1-2 unique, default `["PIX"]`), `products` (min 1; each `externalId` unique, `name`, `quantity>=1`, `price` in centavos **min 100**; `description` optional), `returnUrl`, `completionUrl`.
- Optional: `customerId` **or** `customer` (if `customer` is sent, all four fields `name, cellphone, email, taxId` are required; created if new), `allowCoupons` (default false), `coupons` (max 50), `externalId`, `metadata`.
- v1 products are auto-created from `products[]` (keyed by `externalId`). No BOLETO in v1.
- Response `Billing`:

```json
{
  "data": {
    "id": "bill_123456",
    "url": "https://pay.abacatepay.com/bill-5678",
    "amount": 10000,
    "status": "PENDING",
    "devMode": true,
    "methods": ["PIX"],
    "products": [{ "id": "prod_123456", "externalId": "prod-1234", "quantity": 1 }],
    "frequency": "ONE_TIME",
    "nextBilling": null,
    "customer": null,
    "allowCoupons": false,
    "coupons": []
  },
  "error": null
}
```

- v1 `status`: `PENDING`, `EXPIRED`, `CANCELLED`, `PAID`, `REFUNDED`. `amount` is marked deprecated in the spec. `createdAt`/`updatedAt` are in `required` but not in `properties` (spec bug).
- `GET /v1/billing/list` returns `Billing[]` (no params documented). There is **no** `GET /billing/get` in the v1 OpenAPI extraction (**UNVERIFIED** whether one exists outside the spec). No v1 refund endpoint appears in the spec.
- v1 `customer` objects in responses are oddly shaped: `{ "id": "cust_...", "metadata": { "name", "cellphone", "email", "taxId" } }` (spec says so).

---

## 3. Pix QR Code (direct charge)

### 3.1 v2: transparent checkout, `POST /v2/transparents/create` with `method: "PIX"`

Docs: [Pix](https://docs.abacatepay.com/pages/transparents/create), [reference](https://docs.abacatepay.com/pages/transparents/reference). Scope `TRANSPARENT:CREATE`.

The body is a union keyed on `method` with the payload under `data`:

```json
POST /v2/transparents/create
{
  "method": "PIX",
  "data": {
    "amount": 10000,
    "description": "Cobranca PIX no checkout transparente",
    "expiresIn": 3600,
    "externalId": "pedido-123",
    "customer": { "name": "Daniel Lima", "email": "daniel_lima@abacatepay.com", "taxId": "111.444.777-35", "cellphone": "(11) 4002-8922" },
    "ensureSameTaxId": false,
    "utm": { "source": "newsletter", "medium": "email", "campaign": "lancamento_q1", "term": "pix", "content": "cta_hero" },
    "metadata": { "pedidoId": "pedido-123" }
  }
}
```

| Field | Notes |
|---|---|
| `method` | `"PIX"` \| `"BOLETO"` \| `"CARD"` |
| `data.amount` | integer centavos, **min 100**; the only required Pix field |
| `data.expiresIn` | seconds; default **86400** (24 h); minimum 60 (some providers 300) (types comment) |
| `data.description` | up to 140 chars, no emoji; banks show only the first 37 (v1 spec: maxLength 37) |
| `data.externalId` | a `PENDING` charge with the same id is returned instead of a new one (INFERRED) |
| `data.customer` | if sent, **all four** `name, email, taxId, cellphone` are required (types comment); `taxId` required if `ensureSameTaxId` |
| `data.ensureSameTaxId` | default false; rejects payment from a different CPF/CNPJ; Pix only; not supported by every Pix provider; not enforced in devMode |
| `data.utm` | `source, medium, campaign, term, content` (all optional strings, dashboard-only) |
| `data.metadata` | free-form object |

Response:

```json
{
  "data": {
    "id": "pix_char_abc123xyz",
    "amount": 10000,
    "status": "PENDING",
    "devMode": false,
    "brCode": "00020160014BR.GOV.BCB.PIX070503***6304ABCD",
    "brCodeBase64": "data:image/png;base64,iVBORw0KG...",
    "platformFee": 100,
    "receiptUrl": null,
    "createdAt": "2024-11-04T18:38:28.573Z",
    "updatedAt": "2024-11-04T18:38:28.573Z",
    "expiresAt": "2024-11-04T19:38:28.573Z",
    "metadata": { "pedidoId": "pedido-123" }
  },
  "success": true,
  "error": null
}
```

- `brCode` is the copy-and-paste string; `brCodeBase64` is a ready PNG data URI.
- Status values for a transparent charge (OpenAPI `PixQRCode`/`TransparentCharge`): `PENDING`, `EXPIRED`, `CANCELLED`, `PAID`, `UNDER_DISPUTE`, `REFUNDED`, `REDEEMED`, `APPROVED`, `FAILED`. Pix practically uses `PENDING -> PAID | EXPIRED | CANCELLED (| REFUNDED)`.
- Other transparent methods on the same endpoint: `BOLETO` (`data.amount` min 300, `data.customer.name` + `taxId` required, `data.dueDate`, response has `barCode`, `url`, nested `pix {brCode, brCodeBase64}`, id `bole_...`, not refundable) and `CARD` (section 3.4).

### 3.2 Check status / get / list

- `GET /v2/transparents/check?id=pix_char_...` (`TRANSPARENT:READ`, Pix only, uncached). Returns the status: `PENDING | PAID | EXPIRED | CANCELLED`. Example shape from v1 spec: `{ "data": { "status": "PENDING", "expiresAt": "..." }, "error": null }`. Full v2 response shape **UNVERIFIED** (docs page has no example).
- `GET /v2/transparents/get?id=` returns the full charge (use for `card_...`).
- `GET /v2/transparents/list` params: `limit, after, before, startDate, endDate, method` (e.g. `CARD`). A `status` filter is not documented.
- Webhooks recommended over polling.

### 3.3 Dev-mode payment simulation (exact)

- **v2:** `POST https://api.abacatepay.com/v2/transparents/simulate-payment?id=<pix_char_...>` with `Authorization: Bearer <DEV key>`. **No request body.** `id` is a required **query** parameter ("Identificador unico do Checkout Transparente"). Scope `TRANSPARENT:CREATE`. 200 -> `{ "data": <PixQRCode, status PAID>, "error": null, "success": true }`; 401 -> `{ "error": "..." }`. In production the endpoint errors. Sources: [simulate-payment page](https://docs.abacatepay.com/pages/transparents/simulate-payment), [openapi.yaml](https://raw.githubusercontent.com/AbacatePay/documentation/main/openapi.yaml). Confirmation is immediate ([FAQ](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/faq/index.mdx)).
- **v1:** `POST https://api.abacatepay.com/v1/pixQrCode/simulate-payment?id=<pix_char_...>`. `id` in the query, not the body. The spec marks a body as required but it only contains an optional `metadata`: send `{"metadata":{}}`. Only for QR codes created in dev mode. Response `data: PixQRCode`. Source: [openapi-v1.yaml](https://raw.githubusercontent.com/AbacatePay/documentation/main/openapi-v1.yaml). The official Node SDK 3.0.0 deprecated the `metadata` argument of `pix.simulate`.
- Webhook fired after simulation: the docs say your "webhook or polling gets status PAID". Event name is **UNVERIFIED** for the simulate path; expect `transparent.completed` (v2). The FAQ says "Pix confirmations arrive as `transparent.completed` or `checkout.completed`".
- **Hosted-checkout (`bill_...`) Pix simulation via API: UNVERIFIED / appears not to exist.** The simulate endpoint is documented for transparent charges only. Dev mode docs say hosted checkout supports simulated **card** payments (test card below); how to pay a hosted **Pix** in dev mode is not documented. For deterministic automated tests prefer transparent Pix + `simulate-payment`.
- Test cards (dev mode only): approved `4242 4242 4242 4242`, any future expiry, any CVV; declines by number: `4000000000000002` issuer decline, `4000000000000069` expired card, `4000000000000127` invalid CVV ([Dev mode](https://docs.abacatepay.com/pages/devmode)). Dev-mode `cardToken` has the form `dev_card_<last4>` (e.g. `dev_card_4242`). Dev mode docs mention no test CPFs.

### 3.4 Card via transparent checkout (v2)

Source: [card page](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/transparents/card.mdx), [abacatepay.js](https://docs.abacatepay.com/pages/transparents/abacatepay-js), [public key](https://docs.abacatepay.com/pages/transparents/public-key).

- Browser: abacatepay.js with the `pk_...` public key tokenizes the card -> single-use `ctok_...` token (valid **60 seconds**, one charge, same environment/store).
- Backend: `POST /v2/transparents/create` with `"method": "CARD"`, `data: { amount, installmentCount?(1..12, default 1), customer{name,email,taxId,cellphone all required}, metadata (string values only), token | cardToken (exactly one) }`.
  - Each installment >= R$ 10,00 (`amount >= installmentCount*1000`).
  - With `token`, `amount` must equal the tokenized amount; with `cardToken` any amount.
  - `cardToken` (permanent, from a previous charge) charges later without the customer and **without 3DS**.
- Response: `{ id: "card_...", amount, status: "APPROVED"|"PENDING"|..., devMode, cardToken, brand, lastFour, installmentCount?, installmentAmount?, installmentNumber(=1), installmentGroupId?("cinst_..."), receiptUrl: null, createdAt, updatedAt, expiresAt, metadata }`.
- Card statuses: `APPROVED` (release the order), `PENDING`, `PAID` (acquirer settled; **no extra webhook** is sent for APPROVED -> PAID), `FAILED` (shows only in get/list; at creation a decline is a 400), `REFUNDED`, `UNDER_DISPUTE`.
- Decline error is deliberately generic: `Nao foi possivel processar o pagamento com este cartao` (400). Other 400s: `Invalid or expired card token`, `amount does not match the tokenized amount`, `Card token not found`, `Provide exactly one of token (ctok_) or cardToken`.
- An installment sale emits a single `transparent.completed` with the first installment's `id` and the sale total in `amount`.

---

## 4. Customers

Docs: [reference](https://docs.abacatepay.com/pages/client/reference), [create](https://docs.abacatepay.com/pages/client/create).

### v2: `POST /v2/customers/create` (`CUSTOMER:CREATE`), body is flat (not wrapped in `data`; one docs example wraps it, the OpenAPI and the create page are flat)

| Field | Type | Required |
|---|---|---|
| `email` | string | **yes (only required field)** |
| `name` | string | no (recommended) |
| `cellphone` | string | no (recommended; examples `+5521988887777` and `(11) 4002-8922`; format rules **UNVERIFIED**) |
| `taxId` | string CPF/CNPJ | no (recommended; masked or digits accepted; invalid CPF/CNPJ rejected) |
| `zipCode` | string | no (`00000-000`) |
| `metadata` | object | no |

```json
POST /v2/customers/create
{ "email": "maria@example.com", "name": "Maria Souza", "taxId": "12345678909", "cellphone": "+5521988887777", "zipCode": "20040-020", "metadata": { "plan": "basic" } }
```

Response `data`: `{ id: "cust_...", devMode, email, taxId, country: "BR", name, cellphone, zipCode, metadata }` (OpenAPI marks `id, devMode, name, cellphone, email, taxId` as required in the response schema even though create only requires `email`; nullability **UNVERIFIED**).

- **Dedupe:** customers are unique per `taxId`; creating with an existing CPF/CNPJ returns the existing record.
- `GET /v2/customers/get?id=`, `GET /v2/customers/list` (cursor pagination), `POST /v2/customers/delete?id=` (does **not** cancel linked charges/subscriptions).
- Webhooks mask `taxId` (`123.***.***-**`); `customer` may be `{id:"", name:null,...}` when no customer is linked (fixture `noCustomer`).

### v1: `POST /v1/customer/create`

All four are required, `additionalProperties: false`: `{ "name": "Daniel Lima", "cellphone": "(11) 4002-8922", "email": "daniel_lima@abacatepay.com", "taxId": "111.444.777-35" }`. `GET /v1/customer/list` returns `Customer[]`. Response `Customer` is `{ id, metadata: { name, cellphone, email, taxId } }` (taxId unformatted digits in the example).

---

## 5. Subscriptions / recurring billing

**AbacatePay supports subscriptions natively in v2 only.** v1 has no subscription endpoints in its OpenAPI (only a `nextBilling` field on Billing and `subscription.*` event names in an example webhook table; **UNVERIFIED** v1 recurring behavior). Docs: [concepts](https://docs.abacatepay.com/pages/concepts/subscriptions), [reference](https://docs.abacatepay.com/pages/subscriptions/reference), [create](https://docs.abacatepay.com/pages/subscriptions/create). The model was split on **2026-09-23 (breaking)** into subscription **checkouts** and subscriptions (changelog).

### 5.1 Model

1. Create a recurring **product** (`POST /v2/products/create` with `cycle`). Cycles: `WEEKLY`, `MONTHLY`, `QUARTERLY`, `SEMIANNUALLY`, `ANNUALLY`. Optional `trialDays` (1..90) only with a cycle.
2. `POST /v2/subscriptions/create` creates a **subscription checkout** (`bill_...`, `frequency: "SUBSCRIPTION"`). It does **not** create a subscription.
3. The customer pays the first charge on the hosted page (card tokenized for later cycles). Only then does the **subscription** (`subs_...`) exist. One checkout can produce many subscriptions (one per paying customer).
4. AbacatePay charges automatically every cycle, retries on failure per `retryPolicy`, emits webhooks.

### 5.2 Endpoints

| Endpoint | Scope | Purpose |
|---|---|---|
| `POST /v2/subscriptions/create` | `SUBSCRIPTION:CREATE` | create subscription checkout |
| `GET /v2/subscriptions/checkouts/get`, `/checkouts/list` | `SUBSCRIPTION:READ` | read subscription checkouts (`bill_`) |
| `POST /v2/subscriptions/checkouts/delete` | `SUBSCRIPTION:DELETE` | remove a checkout; does **not** cancel subscriptions it generated |
| `GET /v2/subscriptions/get` (`id`/`externalId`/`customerId`), `/list` (`status` ACTIVE\|CANCELLED, `checkoutId`, cursor pagination) | `SUBSCRIPTION:READ` | read subscriptions (`subs_`) |
| `POST /v2/subscriptions/cancel` | `SUBSCRIPTION:DELETE` | cancel immediately |
| `POST /v2/subscriptions/change-plan` | `SUBSCRIPTION:CREATE` | schedule plan change for next cycle |
| `POST /v2/subscriptions/record-usage` | `SUBSCRIPTION:CREATE` | metered usage added to next installment |

Create body (`additionalProperties: false`, only `items` required; from [openapi.yaml](https://raw.githubusercontent.com/AbacatePay/documentation/main/openapi.yaml) and [types](https://raw.githubusercontent.com/AbacatePay/ecosystem/main/packages/types/types/v2/rest.ts)):

```json
POST /v2/subscriptions/create
{
  "items": [{ "id": "prod_abc123xyz", "quantity": 1 }],
  "customerId": "cust_abc123xyz",
  "externalId": "subs-123",
  "returnUrl": "https://example.com/back",
  "completionUrl": "https://example.com/sucesso",
  "methods": ["CARD"],
  "coupons": [],
  "card": { "maxInstallments": 1 },
  "retryPolicy": { "maxRetry": 5, "retryEvery": 3 },
  "metadata": {}
}
```

- `items`: exactly one item (multi-product needs a store feature flag; all products must share the same cycle). Product **must** have a `cycle` or you get an error (HTTP 422 for "valid fields, invalid combination").
- `methods`: `["CARD"]` default. `PIX` (Pix Automatico) is accepted since 2026-05-15 but "needs the feature enabled on your store" (types comment, changelog); the OpenAPI description still says "only CARD". Treat Pix subscriptions as **gated, UNVERIFIED how to enable** (the Pix concepts page says only "used in subscriptions"; its authorization QR expires in 1 h). Docs do not explain Pix recurring mechanics (new QR vs automatic debit); **UNVERIFIED**.
- `retryPolicy`: `maxRetry` 1..10 (default 3), `retryEvery` 1..30 days (default 1); if sent both are required (types).
- `card.maxInstallments` must be `1` for subscriptions (no installments).
- Response: the Checkout object (section 2.1) with `frequency: "SUBSCRIPTION"`; redirect the customer to `data.url`.

Subscription object (`get`/`list`/`cancel`; OpenAPI `Subscription`, all fields required):

```json
{
  "id": "subs_abc123xyz",
  "checkoutId": "bill_abc123xyz",
  "customerId": "cust_abc123xyz",
  "amount": 10000,
  "status": "ACTIVE",
  "method": "CARD",
  "coupons": [],
  "devMode": false,
  "trialDays": null,
  "trialEndsAt": null,
  "retryPolicy": { "maxRetry": 5, "retryEvery": 3 },
  "createdAt": "2026-10-01T12:00:00.000Z",
  "updatedAt": "2026-10-01T12:00:00.000Z"
}
```

- **Subscription `status`**: `PENDING`, `ACTIVE`, `CANCELLED` (OpenAPI and webhook types). The concepts page claims a failed-retries state `FAILED`, but the reference page, OpenAPI and webhooks all use `CANCELLED` + `cancelledDueTo: "max_payment_retries_exceeded"`. **Trust CANCELLED.** There is no `PAUSED`, no `PAST_DUE`, no pause/resume endpoint (**not supported**).
- **Cancel**: `POST /v2/subscriptions/cancel` body `{ "id": "subs_abc123xyz" }`. Immediate, no grace period, cancels pending installments. Returns the subscription with `status: "CANCELLED"`. There is **no** request-level `cancelPolicy`; `cancelPolicy` (`"NOW"` / `"NEXT_CYCLE"` per the webhook type) only appears in webhook payloads, and the only documented value in use is `NOW`. Cancel at period end is **not offered by the API** (a library must emulate it by cancelling at the right time itself).
- **Change plan**: `POST /v2/subscriptions/change-plan` body `{ "id": "subs_...", "productId": "prod_...", "quantity": 1 }` (OpenAPI also accepts `items: [{productId, quantity}]` for multi-product). New product must have the **same cycle**. No proration is mentioned; the new price starts at the next cycle. Returns a pending update:

```json
{ "id": "subu_abc123xyz", "subscriptionId": "subs_abc123xyz", "status": "PENDING", "productId": "prod_plano_pro", "quantity": 1, "newAmount": 4990, "requestedAt": "2024-12-06T20:05:00.000Z" }
```

  `status`: `PENDING` -> `APPLIED` (or `CANCELLED`). Only one pending update at a time; a new call replaces it. Fires `subscription.plan_changed`.
- **Record usage**: `POST /v2/subscriptions/record-usage` body `{ "id": "subs_...", "productId": "prod_...", "units": 50, "action": "add" | "subtract" }`. The product must have **no** cycle. Response `{ id: "usgr_...", subscriptionId, productId, units, unitPrice, action, installmentNumber, recordedAt }`. The next installment = sum(add x unitPrice) - sum(subtract x unitPrice).
- **Trial**: set `trialDays` on the product. The checkout charges R$ 0,00 and tokenizes the card; the subscription becomes `ACTIVE` immediately with `trialDays`/`trialEndsAt` set; first full charge at `trialEndsAt`. Event `subscription.trial_started`.
- **Refunds of subscription charges are not supported** via API v2 (`Cobrancas de assinatura nao podem ser reembolsadas pela API v2`).
- No customer portal; you build self-service cancel yourself.

---

## 6. Products, coupons, payouts, Pix send, store, extras

### 6.1 Products (v2 only; v1 inlines products in billing)

`POST /v2/products/create` ([reference](https://docs.abacatepay.com/pages/products/reference)):

```json
{ "externalId": "plano-pro", "name": "Plano Pro", "price": 2990, "currency": "BRL", "cycle": "MONTHLY", "trialDays": 14 }
```

- Required: `externalId` (unique), `name`, `price` (centavos), `currency` (`"BRL"`). Optional: `description`, `imageUrl` (max 5 MB), `fileUrl` (public PDF, up to 20 MB, stored by AbacatePay; response only exposes `hasFile`), `cycle` (`null` = one-time), `trialDays` (1..90, requires `cycle`).
- Response `data`: `{ id: "prod_...", externalId, name, description, imageUrl, hasFile, price, currency, devMode, status: "ACTIVE", cycle, trialDays, createdAt, updatedAt }`. Other `status` values **UNVERIFIED** (only `ACTIVE` is shown).
- `GET /v2/products/get`, `GET /v2/products/list` (only cursor/date filters documented; `status`/`search`/`externalId` filters **UNVERIFIED**), `POST /v2/products/delete`. **No update endpoint** is documented, so a price change means creating a new product.

### 6.2 Coupons

`POST /v2/coupons/create` ([reference](https://docs.abacatepay.com/pages/coupons/reference)):

```json
{ "code": "PROMO20", "discountKind": "FIXED", "discount": 2000, "maxRedeems": 50, "notes": "R$20 off", "metadata": { "campaign": "launch" } }
```

- `code` (unique; becomes the coupon `id`), `discountKind` `PERCENTAGE` (hundredths of a percent, max 10000) | `FIXED` (centavos, v1 spec minimum 100), `discount`, `maxRedeems` (`-1` = unlimited; SDK 3.0.0 says `coupons.create` requires `maxRedeems`), `notes`, `metadata`.
- Response: `{ id, discountKind, discount, maxRedeems, redeemsCount, status, devMode, notes, createdAt, updatedAt }`. `status`: `ACTIVE` | `INACTIVE` | `EXPIRED` (v1 spec; v2 docs only show `ACTIVE`).
- `GET /v2/coupons/get|list`, `POST /v2/coupons/toggle` (active <-> inactive; id location UNVERIFIED), `POST /v2/coupons/delete?id=`.
- Apply by passing `coupons: ["PROMO20"]` (max 50) in checkout/subscription create (v1: also `allowCoupons: true`).

### 6.3 Payouts (withdraw to your own account) and Pix send (third parties)

- `POST /v2/payouts/create` (`WITHDRAW:CREATE`): body `{ "amount": 5000, "pix": { "type": "CNPJ", "key": "12345678000190" }, "externalId": "withdraw-001", "description": "..." }`. Required `amount` (centavos, **min 350**) and `pix`; `pix.type` in `CPF|CNPJ|PHONE|EMAIL|RANDOM|BR_CODE`. Only to a key under the **account's own CNPJ**. Fee (`platformFee`) is deducted from `amount`. Production only.
- `POST /v2/pix/send`: body `{ "amount": 10000, "externalId": "pix-123", "pix": { "type": "EMAIL", "key": "a@b.com" }, "description": "..." }`. Required `amount` (**min 100**), `externalId`, `pix`. For third parties.
- Response (`PixTransaction`): `{ id: "tran_...", status: "COMPLETE"|"FAILED", devMode, receiptUrl, amount, platformFee, externalId, createdAt, updatedAt }`. `FAILED` returns the money to your balance.
- `GET /v2/payouts/get|list`, `GET /v2/pix/get?id=|externalId=`, `GET /v2/pix/list` (no pagination). Webhooks: `payout.*`, `transfer.*`.
- v1: `POST /v1/withdraw/create` `{ externalId, method: "PIX", amount (min 350), pix: { type, key }, description? }`, `GET /v1/withdraw/get?externalId=`, `GET /v1/withdraw/list`. Since 2026-06-09 v1 payouts reject keys not belonging to your own CNPJ.

### 6.4 Store, balance, statement, reports, MRR

- `GET /v2/stores/get` (`STORE:READ`) -> `{ id, name, balance: { available, pending, blocked } }` (centavos; may be cached up to 1 h). `GET /v2/stores/list` (dev + prod balances summed). v1: `GET /v1/store/get`.
- `GET /v2/bank-statement/list` (`BANK_STATEMENT:READ`, added 2026-09-29): transactions with `movements[].balanceEffect`.
- `/v2/reports/*` exist (SDK 3.0.0 mentions `reports.*`, `mrr.byDay`); not researched in depth. Public MRR endpoints (`/public-mrr/*`) use a separate `mrr_` token (TrustMRR).
- Fees: **no numeric fees in the docs** ([taxas](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/concepts/taxas.mdx)); see [pricing](https://www.abacatepay.com/pricing). Fees are deducted automatically; `platformFee` (centavos) on each response/webhook reports them. Card settlement timing is not documented ("tem um prazo de liquidacao"). No monthly fee.

---

## 7. Refunds

Source: [checkout refund](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/payment/refund.mdx), [transparent refund](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/transparents/refund.mdx). Added 2026-05-14.

- v2 endpoints (scope `REFUND:CREATE`): `POST /v2/checkouts/refund`, `POST /v2/payment-links/refund`, `POST /v2/transparents/refund`.
- Body: `{ "id": "...", "reason": "..." }` (`reason` optional). Accepted `id`: `bill_...` (resolves to the paid payment intent), `char_...`, `pix_char_...`, `card_...`.
- **Full refunds only. No partial refund. No `amount` field.**
- Refundable methods: `PIX`, `PIX_QRCODE`, `CARD`. **Not** refundable via API: boleto, TED, internal transfers, **subscription charges**.
- State required: Pix must be `COMPLETE`; card `APPROVED` or `COMPLETE`. Disputed (`UNDER_DISPUTE`) transactions are blocked. No refund time window is documented (**UNVERIFIED** whether one exists).
- The amount is debited from `available` balance (sometimes `pending` for card); if short -> `INSUFFICIENT_FUNDS`.
- In devMode refunds confirm instantly with no real provider.
- Response:

```json
{
  "data": {
    "id": "tran_abc123xyz",
    "status": "COMPLETE",
    "amount": 10000,
    "reason": "Pedido cancelado pelo cliente.",
    "originalId": "bill_abc123xyz",
    "createdAt": "2026-10-05T14:30:00.000Z"
  },
  "success": true,
  "error": null
}
```

- Effects: original transaction, billing and payment intent become `REFUNDED`; webhook `checkout.refunded` (or `transparent.refunded` for charges with no linked checkout).
- Idempotent-ish: a second refund returns **HTTP 400** with `Esta cobranca ja foi reembolsada.`; treat as "already refunded".
- Error `error` codes (string): `LOCK_NOT_ACQUIRED` (retry), `TRANSACTION_NOT_FOUND`, `TRANSACTION_NOT_REFUNDABLE`, `TRANSACTION_UNDER_DISPUTE`, `INVALID_METHOD`, `INSUFFICIENT_FUNDS`, `STORE_NOT_FOUND`, `REFUND_REQUEST_FAILED`, `REFUND_CONFIRMATION_FAILED`.
- v1: no refund endpoint found in the v1 OpenAPI (UNVERIFIED that none exists). v1 `status` enum contains `REFUNDED` and a `billing.refunded` event appears in the v1 webhook docs table.

---

## 8. Webhooks

Docs: [webhooks](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/webhooks.mdx), [security](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/webhooks/security.mdx), [reference](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/webhooks/reference.mdx), [v1 webhooks](https://docs.abacatepay.com/pages/v1/webhooks). Official types: [`types/v2/webhook.ts`](https://raw.githubusercontent.com/AbacatePay/ecosystem/main/packages/types/types/v2/webhook.ts), [`types/v1/webhook.ts`](https://raw.githubusercontent.com/AbacatePay/ecosystem/main/packages/types/types/v1/webhook.ts).

### 8.1 Registration

- **Both** dashboard (Webhooks -> Create: Name, URL, Secret) and API. (The `webhooks.mdx` page describes only the dashboard, but `webhooks/reference` and OpenAPI document the API.)
- `POST /v2/webhooks/create` (`WEBHOOK:CREATE`), body `WebhookCreateInput` (all required, `additionalProperties: false`):

```json
{
  "name": "Meu Webhook de Pagamentos",
  "endpoint": "https://meusite.com/webhooks/abacatepay",
  "secret": "<at least 32 characters>",
  "events": ["checkout.completed", "subscription.renewed"]
}
```

  - `endpoint`: public **HTTPS**; no local addresses/private IPs.
  - `secret`: "at least 32 characters" (types comment; the OpenAPI says only "your key used to authenticate our webhook"). Legacy deliveries append it as `?webhookSecret=`; Standard Webhooks deliveries are signed with it.
  - `events`: enum of 16 names (below); v1 names (`billing.paid`, `billing.disputed`, `withdraw.done`, `withdraw.failed`) are also accepted and delivered with the v1 payload.
- Response (`WebhookResponse`): `{ id: "webh_abc123xyz", name, endpoint, events, devMode: false, v2: true, createdAt, updatedAt }`. Note: the `secret` is **not returned**.
- `GET /v2/webhooks/get?id=`, `GET /v2/webhooks/list` (`search`, `id`, cursor + date filters), `POST /v2/webhooks/delete?id=` (200 with no `data`). **No update endpoint** documented (delete + recreate to change events/URL).
- A webhook created in dev mode only receives simulated events; production needs its own.
- A manual resend from the dashboard makes one attempt with a **new** `id`.

### 8.2 Event names

Accepted in `events` (OpenAPI `WebhookCreateInput` + docs):

| Event | Meaning |
|---|---|
| `checkout.completed` | hosted checkout / payment link / subscription-checkout payment confirmed |
| `checkout.refunded` | checkout refund finished |
| `checkout.disputed` | chargeback opened **and again when resolved** (lost dispute arrives as `disputed` with `status: "REFUNDED"`) |
| `checkout.lost` | **never sent** (deprecated in types; subscribable but dead) |
| `transparent.completed` | transparent (Pix/Boleto/Card) payment confirmed |
| `transparent.refunded` / `transparent.disputed` | as checkout |
| `transparent.lost` | **never sent** |
| `subscription.completed` | first payment done; subscription active |
| `subscription.trial_started` | trial subscription created |
| `subscription.renewed` | a recurring charge was paid |
| `subscription.payment_failed` | a cycle charge failed (each failure) |
| `subscription.plan_changed` | plan change requested (and again when applied at renewal) |
| `subscription.cancelled` | cancelled via API/dashboard or auto after retries exhausted |
| `payout.completed` / `payout.failed` | withdrawal (own account) done/failed |
| `transfer.completed` / `transfer.failed` | Pix send (third party) done/failed |

Caveat: `subscription.plan_changed` and `subscription.payment_failed` exist in the TS types, SDK dispatcher, docs reference page and changelog (2026-04-29), but the **OpenAPI `WebhookCreateInput.events` enum omitted them** in the copy I read (it listed 16 events without those two but with the two `*.lost` ones). Docs say they are valid events; if `webhooks/create` rejects them, omit and subscribe via the dashboard (**UNVERIFIED**).

v1 events (legacy): the v1 docs page lists `billing.created`, `billing.paid`, `billing.refunded`, `billing.failed`, `subscription.created`, `subscription.canceled` as examples and says the exact list "varies by when your integration was made" (v1 docs page; `withdraw.done` is not mentioned there). The official v1 TS types define `billing.paid`, `billing.disputed` (referenced in the v2 types), `withdraw.done`, `withdraw.failed`. **The v1 event list is inconsistent between sources; UNVERIFIED.**

### 8.3 Envelope, delivery, signature

**Legacy envelope** (all v2 webhooks created before an undisclosed "Standard Webhooks cutoff"):

```json
{ "id": "log_abc123xyz", "event": "checkout.completed", "apiVersion": 2, "devMode": false, "data": { } }
```

- `id` is the **delivery id** (`log_...`), identical across automatic retries: use it for deduplication. No ordering guarantee. `taxId` is masked; cards expose brand + last 4 only.

**Standard Webhooks envelope** (endpoints "created on or after the cutoff", per doc comments in [`types/v2/webhook.ts`](https://raw.githubusercontent.com/AbacatePay/ecosystem/main/packages/types/types/v2/webhook.ts)): no `id`/`event`; instead `type` (same value as `event`), `timestamp` (first delivery attempt, ISO 8601; retries keep it), `apiVersion`, `devMode`, `data`; the delivery id is the **`webhook-id` header**. The cutoff date, the signature header names/format, and the key derivation (is `secret` used raw or `whsec_`-style base64?) are **UNVERIFIED**: the official docs pages do not mention Standard Webhooks at all (not on the security page, webhooks page, or changelog); only the TS types and a test fixture (`standardTransparentCompleted`) do. A library should accept both envelopes (detect `type` vs `event`, `webhook-id` header) and, until verified against a live account, not assume the Standard Webhooks verification details.

**Legacy authentication (documented, use both)** ([security page](https://docs.abacatepay.com/pages/webhooks/security)):

1. **Query-string secret**: AbacatePay appends `?webhookSecret=<your secret>` to the URL you registered; compare with your stored value (constant time); reply 401 on mismatch. The llms.txt notes this is what proves the sender, while the signature "only confirms the body was not altered".
2. **HMAC signature**: header `X-Webhook-Signature`.
   - Algorithm: **HMAC-SHA256**, key = the fixed AbacatePay **public key string below used as raw UTF-8 bytes** (not PEM, not base64-decoded, **not** your webhook secret), message = the **raw request body bytes** before JSON parsing, output **base64** (not hex).
   - Compare with `timingSafeEqual` after checking equal length.
   - The same code is in the official `@abacatepay/adapters` source (`packages/adapters/src/webhooks/signature.ts`): `createHmac('sha256', ABACATEPAY_SHARED_KEY).update(Buffer.from(raw,'utf8')).digest('base64')`.
   - No timestamp/nonce replay protection exists in this scheme; use `id` dedupe.

Documented public key (256 characters; the docs say it is identical in the Node/Python/Go examples). It was read twice, from the raw MDX and from the rendered docs page, and both reads gave the same 8 x 32-character chunks. It was **not** cross-checked against the SDK constant `ABACATEPAY_SHARED_KEY` in `packages/adapters/src/webhooks/signature.ts` (that read declined to echo the value), and it has not been tested against a live delivery. Before shipping, **copy it from the docs page and verify it against a real dev-mode webhook** (a mismatch means the docs or my transcription are wrong):

```
t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9
```

Reference implementation (Node, matches the docs/SDK):

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const ABACATEPAY_PUBLIC_KEY = "<256-char key above>";

export function verifySignature(rawBody: string | Buffer, header: string | null): boolean {
  const expected = createHmac("sha256", ABACATEPAY_PUBLIC_KEY).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Because the key is public, anyone can forge a valid `X-Webhook-Signature`; the **query secret is the real authentication**. Always validate both, use HTTPS, and read the raw body (do not re-serialize JSON).

**Delivery and retries** ([webhooks page](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/webhooks.mdx), [changelog 2026-09-18](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/changelog/index.mdx), [FAQ](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/faq/index.mdx)):

- Success = any `2xx` within **30 s**; the response body is ignored. Reply 200 only after processing.
- Up to **7 attempts**: immediately, then +5 s, +5 min, +30 min, +2 h, +5 h, +10 h (~18 h total).
- Retried on: timeout, connection/DNS/TLS errors, 5xx, 408, 429. Not retried on other 4xx or 3xx (redirects are not followed). **`410 Gone` disables the webhook.**
- Applies equally in dev mode and to v1 webhooks. Disabling/deleting a webhook discards pending retries.
- Do not validate payloads with strict schemas (fields are added over time).

### 8.4 Payload examples (v2, legacy envelope)

Sources: docs event pages ([checkout](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/webhooks/events/checkout.mdx), [transparent](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/webhooks/events/transparent.mdx), [subscriptions](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/webhooks/events/subscriptions.mdx), [payouts](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/webhooks/events/payouts.mdx), [transfers](https://raw.githubusercontent.com/AbacatePay/documentation/main/pages/webhooks/events/transfers.mdx)), plus fixtures in `packages/zod/test/webhook-fixtures.ts` ([source](https://raw.githubusercontent.com/AbacatePay/ecosystem/main/packages/zod/test/webhook-fixtures.ts)). Values are illustrative; field names are from the official types.

`checkout.completed` (Pix):

```json
{
  "id": "log_1",
  "event": "checkout.completed",
  "apiVersion": 2,
  "devMode": false,
  "data": {
    "checkout": {
      "id": "bill_1", "externalId": null, "url": "https://app.abacatepay.com/pay/bill_1",
      "amount": 1000, "paidAmount": 1000, "platformFee": 80,
      "items": [{ "id": "prod_1", "quantity": 1 }], "status": "PAID", "methods": ["PIX", "CARD"],
      "frequency": "ONE_TIME", "coupons": [], "devMode": false, "customerId": "cust_1",
      "returnUrl": "https://example.com/back", "completionUrl": "https://example.com/done",
      "receiptUrl": null, "metadata": { "orderId": "ord_1" },
      "createdAt": "2026-10-01T12:00:00.000Z", "updatedAt": "2026-10-01T12:05:00.000Z",
      "trialDays": null, "trialEndsAt": null, "nextChargeAt": null, "card": { "maxInstallments": 1 },
      "interest": {}, "fine": {}, "dueDate": null, "upSellProductId": null,
      "installmentsCount": null, "payerInformation": null, "utms": {}
    },
    "customer": { "id": "cust_1", "name": "Maria Silva", "email": "maria@exemplo.com", "taxId": "529.***.247-**" },
    "payerInformation": {
      "method": "PIX",
      "utms": { "source": null, "medium": null, "campaign": null, "term": null, "content": null },
      "PIX": { "name": "Maria Silva", "taxId": "529.***.247-**", "isSameAsCustomer": true }
    }
  }
}
```

- `checkout.refunded` and `checkout.disputed` add `data.reason` (string, e.g. `"requested_by_customer"`, `"Dispute created"`). Card variant: `payerInformation: { method: "CARD", CARD: { number: "4242", brand: "VISA" } }`; checkout card sales may carry `installmentsCount`. Docs examples show `status: "PAID"` even on refunded/disputed examples, so **read `status` from the event + reason, don't assume**.

`transparent.completed` (card, installments):

```json
{
  "id": "log_3", "event": "transparent.completed", "apiVersion": 2, "devMode": true,
  "data": {
    "transparent": {
      "id": "card_1", "externalId": null, "amount": 3000, "paidAmount": null, "platformFee": 134,
      "status": "APPROVED", "items": [], "methods": [], "frequency": "ONE_TIME", "coupons": [],
      "devMode": true, "customerId": "cust_1",
      "createdAt": "2026-10-09T15:00:00.000Z", "updatedAt": "2026-10-09T15:00:01.000Z",
      "receiptUrl": null, "metadata": { "orderId": "ord_42" },
      "installmentCount": 2, "installmentAmount": 1500, "installmentNumber": 1, "installmentGroupId": "cinst_1"
    },
    "customer": { "id": "cust_1", "name": "Maria Silva", "email": "maria@exemplo.com", "taxId": "529.***.247-**" },
    "payerInformation": { "method": "CARD", "utms": { "source": null, "medium": null, "campaign": null, "term": null, "content": null }, "CARD": { "number": "4242", "brand": "VISA" } }
  }
}
```

- Pix/Boleto `transparent.completed`: `status: "PAID"`, `payerInformation.PIX|BOLETO = { name, taxId, isSameAsCustomer }`, `id` `pix_char_...`/`bole_...`. `transparent.disputed`: `status` `UNDER_DISPUTE` then `PAID` (won) or `REFUNDED` (lost). The `cardToken` is **not** in webhooks; store it from the create response.

`subscription.completed` / `subscription.renewed` (card):

```json
{
  "id": "log_abc", "event": "subscription.renewed", "apiVersion": 2, "devMode": false,
  "data": {
    "subscription": {
      "id": "subs_1", "amount": 2200, "currency": "BRL", "method": "CARD", "status": "ACTIVE",
      "frequency": "MONTHLY", "createdAt": "2026-09-01T12:00:00.000Z", "updatedAt": "2026-10-01T12:00:00.000Z",
      "canceledAt": null, "cancelPolicy": null, "cancelledDueTo": null
    },
    "customer": { "id": "cust_1", "name": "Maria Silva", "email": "maria@exemplo.com", "taxId": "529.***.247-**" },
    "payment": { "id": "char_1", "externalId": null, "amount": 2200, "paidAmount": 2200, "platformFee": 100, "status": "PAID", "methods": ["CARD"], "receiptUrl": null, "createdAt": "2026-10-01T12:00:00.000Z", "updatedAt": "2026-10-01T12:00:05.000Z", "metadata": {} },
    "payerInformation": { "method": "CARD", "CARD": { "number": "4242", "brand": "VISA" } },
    "checkout": { "id": "bill_renewxyz789", "frequency": "SUBSCRIPTION", "status": "PAID", "amount": 2200, "paidAmount": 2200, "items": [{ "id": "prod_1", "quantity": 1 }] }
  }
}
```

- `subscription.frequency` in the webhook type also allows `DAILY` (product cycles do not). `subscription.trial_started`: `data.subscription` has `trialDays`/`trialEndsAt`, no `payment`.
- `subscription.payment_failed` (card): `data = { subscription, customer, installmentId: "intl_1", installmentNumber: 2, retryNumber: 3 }`; the Pix-Automatico variant carries `rejectCode` (e.g. `"AP13"`) instead of `retryNumber`. Fires on **every** failed attempt; when `retryNumber` reaches `retryPolicy.maxRetry` the subscription is cancelled automatically.
- `subscription.cancelled`: `cancelPolicy: "NOW"`, `cancelledDueTo: null` for manual cancels; `cancelledDueTo: "max_payment_retries_exceeded"` (with `retryPolicy`) when auto-cancelled (payload then contains only `subscription` + `customer`).
- `subscription.plan_changed`: when requested, `data` also has `changeSource: "API_CHANGE_PLAN"`, `pendingUpdateId: "subu_1"`, `items:[{productId,quantity,newAmount}]`, `productId`, `quantity`, `newAmount`, `status: "PENDING"`, `requestedAt`; when applied at renewal it has no extra fields and `subscription.amount` shows the new amount.

`payout.completed` / `payout.failed` (note the key is `withdraw`):

```json
{
  "id": "log_10", "event": "payout.completed", "apiVersion": 2, "devMode": false,
  "data": { "withdraw": { "id": "tran_xxx", "amount": 1000, "status": "COMPLETE", "method": "PIX", "platformFee": 80, "receiptUrl": "https://...", "externalId": null, "createdAt": "...", "updatedAt": "...", "endToEndIdentifier": "E123..." } }
}
```

`transfer.completed` / `transfer.failed`: same, with `data.transfer` (and `externalId` non-null); `status` `COMPLETE`/`FAILED`; `endToEndIdentifier` present. For `payout.failed`, `endToEndIdentifier` is absent and `status: "FAILED"`.

**v1 `billing.paid`** (legacy; from the [v1 webhooks page](https://docs.abacatepay.com/pages/v1/webhooks); no `apiVersion`, no `id` shown in the docs example although the TS type has `id`):

```json
{
  "event": "billing.paid",
  "devMode": false,
  "data": {
    "id": "bill_abc123", "externalId": "pedido-123", "amount": 10000, "paidAmount": 10000, "status": "PAID",
    "customer": { "id": "cust_abc123", "email": "customer@example.com" },
    "createdAt": "2024-01-01T12:00:00.000Z", "updatedAt": "2024-01-01T12:05:00.000Z"
  }
}
```

The official v1 TS type differs from that docs example: `data.payment { amount, fee, method }` plus either `data.pixQrCode { amount, id, kind: "PIX", status }` or `data.billing { amount, couponsUsed, customer, frequency, id, kind, paidAmount, products, status }`. Two shapes, **both UNVERIFIED against live traffic**. `withdraw.done` / `withdraw.failed`: `data.transaction` is a Withdraw (`status` `COMPLETE` / cancelled).

---

## 9. Errors and response conventions

- HTTP codes ([API intro v2](https://docs.abacatepay.com/pages/reference/introduction)): 200 OK; 400 invalid request (often wrong types); 401 missing/invalid/revoked key; 403 `Insufficient permissions`; 404 not found; **422** valid fields but invalid combination (e.g. product without `cycle` in a subscription) or type errors such as `Expected property 'data.metadata.pedidoId' to be string but found: 123`; 429 rate limit; 5xx transient.
- The `error` field is a **free-form string**, sometimes an uppercase code (refund: `TRANSACTION_UNDER_DISPUTE`), sometimes an English sentence (`Invalid or expired card token`, `ensureSameTaxId requires a customer with taxId`, `Provide id, externalId or customerId`), sometimes Portuguese (`Esta cobranca ja foi reembolsada.`). There is **no stable machine-readable error-code taxonomy**; a library should map by HTTP status + known substrings and always keep the raw string.
- Some errors depend on the HTTP status too (refund "already refunded" is HTTP 400).
- There is no documented request id header or correlation id.

---

## 10. SDKs

- **Official Node SDK: `@abacatepay/sdk`**, current **3.0.0** (published 2026-10-12; prior 2.0.3 / 2.0.2 / 2.0.1 / 2.0.0 all on 2026-07-27), license Apache-2.0 on npm, Node >= 18, deps `@abacatepay/rest@^1.1.0` and `@abacatepay/types@^4.0.0`. Source: monorepo [`AbacatePay/ecosystem/packages/sdk`](https://github.com/AbacatePay/ecosystem), docs [Node.js SDK](https://docs.abacatepay.com/pages/sdks/nodejs), [npm registry metadata](https://registry.npmjs.org/@abacatepay/sdk), [CHANGELOG](https://raw.githubusercontent.com/AbacatePay/ecosystem/main/packages/sdk/CHANGELOG.md).
  - Init: `import { AbacatePay } from "@abacatepay/sdk"; const abacate = AbacatePay({ secret: process.env.ABACATEPAY_API_KEY! })`. Subpath exports `@abacatepay/sdk/v1` and `/v2`; the v1 client is deprecated and frozen.
  - Methods resolve to `{ data, error, success }` instead of throwing (since 2.0.0). 3.0.0 has breaking changes (cursor pagination, new subscriptions API).
- **Old `abacatepay-nodejs-sdk`** (v1.3.1, MIT, `abacate.billing.create(...)`): README says it is **officially deprecated and unmaintained**; replacement is `@abacatepay/sdk`. Source: [GitHub README](https://github.com/AbacatePay/abacatepay-nodejs-sdk).
- Other ecosystem packages (monorepo): `@abacatepay/types` (all v1/v2 TypeScript types incl. webhook types), `@abacatepay/zod` and `@abacatepay/typebox` (schemas), `@abacatepay/rest` (fetch client), webhook adapters under `packages/adapters` with framework helpers (express/fastify/hono/elysia/better-auth/supabase). The adapters' npm package name was not confirmed (**UNVERIFIED**).
- SDK status per [SDK page](https://docs.abacatepay.com/pages/sdks/sdks): v2 = Node.js and Ruby; Python, Java, PHP, Go, Rust, Kotlin, Swift, Elixir = v1 legacy.
- Also exist: CLI (`abacatepay-cli`, Go), MCP server (`abacatepay-mcp`), AI skills repo.
- Recommendation for a provider-agnostic library: **plain `fetch` is reasonable** (small surface, only GET/POST, uniform envelope). Reuse `@abacatepay/types` for type definitions only if you accept the dependency; the SDK's retry policy (GET-only retries) is worth copying. Webhook verification is ~10 lines of `node:crypto`.

---

## 11. Gotchas and design implications for a provider-agnostic billing library

1. **Two generations of API.** Target v2. v1 has no subscriptions, refunds, boleto, transparent checkout or customer-optional fields; sunsets 2028-03-01. Do not abstract over both.
2. **No inline products in v2 checkouts.** You must create/sync `prod_` products first (keyed by your `externalId`); there is **no product update endpoint**, so price changes = new product + new item id.
3. **Subscription creation is two-step.** `POST /subscriptions/create` returns a `bill_` checkout; the `subs_` id only exists after payment (`subscription.completed`). Map checkout `externalId` <-> your subscription before payment; resolve `checkoutId` -> `subs_` afterwards. One checkout can yield several subscriptions.
4. **Subscription capabilities are thin:** no pause/resume, no cancel-at-period-end, no mid-cycle proration, plan change only to the same cycle at next renewal, no refunds of subscription charges via API, Pix subscriptions gated by a store feature, single product per subscription unless a feature is enabled. Trial is a **product** property.
5. **Webhook authentication is unusual.** The HMAC key is a **public** fixed string, so the `?webhookSecret=` query param is the real auth. Newer endpoints may use **Standard Webhooks** (`webhook-id` header, `type`+`timestamp` body) whose signing details are undocumented. Support both envelopes; verify behavior against a real endpoint before relying on it.
6. **Webhook semantics:** `checkout.*` vs `transparent.*` split by creation surface (a Pix created through `/transparents/create` fires `transparent.completed`, not `checkout.completed`); `*.lost` never fires; `*.disputed` fires on open **and** resolution; card `APPROVED -> PAID` sends **no** event; `payout.*` uses `data.withdraw`, `transfer.*` uses `data.transfer`; delivery ids repeat across retries only; `customer` may be empty; `taxId` is masked in webhooks.
7. **No idempotency header.** Use `externalId` where it dedupes (checkout, subscription, Pix transparent) and **never auto-retry non-GET requests on timeouts** (double card charge / double payout risk).
8. **Refunds are full-only**, limited to Pix + card (no boleto, no subscription charges); no refund window documented.
9. **Dev-mode simulation exists only for transparent Pix** (`/v2/transparents/simulate-payment?id=`); hosted-checkout Pix cannot be simulated via API (UNVERIFIED how in dev). Cards: use `4242...`. Dev/prod webhooks and keys are separate; use `devMode` in responses to detect environment.
10. **Production gating:** CNPJ only (MEI ok), manual review up to 3 business days, card capability per store, payouts production-only.
11. **Cursor pagination** with `pagination.next`; do not trust `hasMore`. `GET`-only for reads; all mutations (incl. deletes) are `POST`.
12. **Inconsistent docs to expect:** webhook `secret` min length (32 chars) appears only in types; payout throttle 30 s vs 60 s; subscription `FAILED` status mentioned in concepts but `CANCELLED` everywhere else; the OpenAPI `events` enum for `webhooks/create` may omit `plan_changed`/`payment_failed`; API key prefixes disagree across pages; the customer-create request is shown wrapped in `data` on one page but flat in the OpenAPI.
13. **Money fields:** `paidAmount` is `null` until paid; `platformFee` is the gateway fee (centavos) and **is deducted** from payout/Pix-send `amount` (recipient gets `amount - platformFee`); net settlement for checkouts is not itemized in the docs.
14. **Error strings are not a stable contract** (mixed codes, English and Portuguese).

---

## 12. Sources checked

- Docs index: https://docs.abacatepay.com/llms.txt
- Intro v2: https://docs.abacatepay.com/pages/reference/introduction ; v1: https://docs.abacatepay.com/pages/v1/introduction ; auth: https://docs.abacatepay.com/pages/authentication ; dev mode: https://docs.abacatepay.com/pages/devmode ; production: https://docs.abacatepay.com/pages/production
- Resource pages (MDX): https://github.com/AbacatePay/documentation/tree/main/pages (payment, payment-links, transparents, subscriptions, client, products, coupons, payouts, pix, store, webhooks, changelog, concepts, faq, sdks)
- OpenAPI: https://raw.githubusercontent.com/AbacatePay/documentation/main/openapi.yaml (v2), https://raw.githubusercontent.com/AbacatePay/documentation/main/openapi-v1.yaml (v1)
- Types/SDK: https://github.com/AbacatePay/ecosystem (`packages/types`, `packages/sdk`, `packages/adapters`, `packages/zod`) ; npm: https://registry.npmjs.org/@abacatepay/sdk
- Old SDK: https://github.com/AbacatePay/abacatepay-nodejs-sdk
- Docs PR documenting the subscription split: https://github.com/AbacatePay/documentation/pull/99
- Not reachable/not used: npmjs.com HTML page (403), GitHub code search (401), exact API-key format examples, a live account (none created).
