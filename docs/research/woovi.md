# Woovi (formerly OpenPix) API: implementation spec

Research date: 2026-10-19. Scope: Pix charges, customers, subscriptions / Pix Automático, refunds, webhooks, sandbox, errors, Node SDK.

## 0. Sources and method

The most reliable source is the **official OpenAPI 3.1.0 document**, which Woovi publishes (140 paths, about 2 MB, `info.version` "1.0.0"):

- Spec: https://api.woovi.com/api/openapi.json (found via the "Download OpenAPI specification" link on https://developers.woovi.com/en/api-redoc)
- Human docs: https://developers.woovi.com/en/ (Docusaurus; Portuguese is the source language, `/en/` is a translation)
- Node SDK repo: https://github.com/woovibr/woovi-nodejs-sdk (the GitHub user `github.com/woovi` is a personal account with 0 repos; the official org is `woovibr`)

Every endpoint, field and enum below comes from the spec unless a different link is cited. Items I could not confirm from an official source are marked **UNVERIFIED**. Items where the docs and the spec disagree are marked **CONFLICT**.

I made a few unauthenticated read-only HTTP requests against public hosts (no sign-up, no credentials): the OpenAPI download, the public webhook-key endpoint on both hosts, and route-existence checks (a `401` means the route exists, a `404` means it does not). They are called out where they matter.

---

## 1. Base URLs, auth, limits, units

| Item | Value | Source |
|---|---|---|
| Production base URL | `https://api.woovi.com` | OpenAPI `servers[0]` |
| Sandbox base URL | `https://api.woovi-sandbox.com` | OpenAPI `servers[1]`; https://developers.woovi.com/en/docs/test-environment |
| Sandbox dashboard | `https://app.woovi-sandbox.com/` (separate sign-up) | https://developers.woovi.com/en/docs/test-environment |
| Paths | Identical on both hosts (`/api/v1/...`) | OpenAPI; same `401` probe on both hosts |
| Legacy OpenPix domain | `api.openpix.com.br` is still mentioned by the docs for the public-key endpoint | https://developers.woovi.com/en/docs/webhook/seguranca/webhook-public-keys (via search summary; UNVERIFIED as a supported alias) |

### Authentication

- Header: `Authorization: <AppID>`. The raw AppID is sent, with **no `Bearer` prefix**. The docs say so explicitly: https://developers.woovi.com/en/docs/apis/getting-started-api
- The spec models it as an `oauth2` security scheme named `AppID`, but it is a static key. The spec's `scopes` are per-AppID permission scopes (see below).
- An AppID is created in the dashboard (API/Plugins, then "Nova API/Plugin", type `API`, 2FA required, ADMIN privileges). The spec does list `POST /api/v1/application` (scope `APPLICATION_POST`, "Create a new application") and `DELETE /api/v1/application`, plus `POST /api/v1/partner/application` (partner-only). I did not read their schemas, and whether a normal merchant AppID can mint new AppIDs is **UNVERIFIED**; assume AppIDs are created by hand in the dashboard. Sandbox and production are completely separate: "os dados de produção não funcionam no ambiente de testes" (https://developers.woovi.com/en/docs/test-environment). That means a separate sign-up and a separate AppID per environment.
- AppIDs can be restricted by scope. Minimal scopes for a billing adapter, from the spec's scope list:
  - Charges: `CHARGE_POST`, `CHARGE_GET`, `CHARGE_GET_LIST`, `CHARGE_DELETE`, `CHARGE_PATCH`
  - Charge refunds: `CHARGE_REFUND_POST`, `CHARGE_REFUND_GET_LIST`
  - Refunds: `REFUND_POST`, `REFUND_GET`, `REFUND_GET_LIST`
  - Customers: `CUSTOMER_POST`, `CUSTOMER_GET`, `CUSTOMER_GET_LIST`, `CUSTOMER_PATCH`
  - Subscriptions: `SUBSCRIPTION_POST`, `SUBSCRIPTION_GET`, `SUBSCRIPTION_GET_LIST`, `SUBSCRIPTION_CANCEL_PUT`, `SUBSCRIPTION_VALUE_PUT`, `SUBSCRIPTION_INSTALLMENT_GET_LIST`, `SUBSCRIPTION_INSTALLMENT_GET`, `SUBSCRIPTION_INSTALLMENT_COBR_POST`, `SUBSCRIPTION_INSTALLMENT_COBR_RETRY_POST`
  - Webhooks: `WEBHOOK_POST`, `WEBHOOK_GET`, `WEBHOOK_GET_LIST`, `WEBHOOK_DELETE`, `WEBHOOK_EVENTS_GET_LIST`, `WEBHOOK_IPS_GET`
  - Transactions: `TRANSACTION_GET`, `TRANSACTION_GET_LIST`
- Missing AppID or scope: **401** for an invalid AppID, **403** for a missing scope or feature (the spec declares 403 on 83 operations; the 403 body shape is UNVERIFIED for non-KYC endpoints).
- IP allow-listing exists: the Anticipation API docs list "401: app_id inválido ou IP não autorizado". Whether this applies to charge endpoints is UNVERIFIED.

### Rate limits and size

- "You can't exceed **10 requests/second**." Any request (headers plus payload) must not exceed **10 MB**. All traffic must be HTTPS. Do not cache server IPs or certificates. Source: https://developers.woovi.com/en/docs/apis/api-getting-started
- Behavior on exceeding the limit (status code, `Retry-After`, burst policy) is **UNVERIFIED**. The spec declares `429` only on a few endpoints (Pix key check, stablecoin, Pix Auth, KYC resend). It does not declare 429 on charge, customer, subscription or webhook endpoints.

### Units and formats

- **Money is integer cents** ("sempre retornam o valor em centavos"; `value: 1000` is R$10,00). Source: https://developers.woovi.com/en/docs/apis/api-common-fields
- **taxID**: requests send a plain string (`"31324227036"`). Responses and webhooks return an object `{ "taxID": "31324227036", "type": "BR:CPF" }` (or `"BR:CNPJ"`). Same source.
- **Dates** are ISO 8601 UTC with milliseconds (`2025-09-24T15:07:47.334Z`). A page on date returns exists at https://developers.woovi.com/en/docs/apis/api-time (not read).
- **Phone**: the request examples use `"5511999999999"` (55 + area code + number). Webhook examples show `"+5511999999999"` and `"119912345670"`. Treat phone as an opaque string and do not round-trip compare it.
- **Pagination**: list responses carry `pageInfo: { skip, limit, hasPreviousPage, hasNextPage }` (plus an `errors` array). See section 2 for which endpoints declare `skip` and `limit`.
- IDs are opaque. `globalID` is a base64 Relay-style ID (`"Q2hhcmdlOjY4ZGJm..."` decodes to `Charge:<mongoId>`).

---

## 2. Charges (Pix cobrança)

Reference: https://developers.woovi.com/en/docs/charge/how-to-create-charge-using-api and the spec operations below.

### Endpoints

| Operation | Method and path | Scope | Notes |
|---|---|---|---|
| Create | `POST /api/v1/charge` | `CHARGE_POST` | Optional query `return_existing=true` |
| Get one | `GET /api/v1/charge/{id}` | `CHARGE_GET` | `id` = charge ID **or `correlationID`** (URI-encode special characters) |
| List | `GET /api/v1/charge` | `CHARGE_GET_LIST` | Query: `start`, `end` (RFC 3339), `status`, `customer` (customer correlationID), `subscription` (subscription correlationID) |
| Delete | `DELETE /api/v1/charge/{id}` | `CHARGE_DELETE` | `id` = charge ID or correlationID. Returns `{ "status": "...", "id": "..." }` |
| Edit expiry | `PATCH /api/v1/charge/{id}` | `CHARGE_PATCH` | Body `{ "expiresDate": "ISO8601" }`. `id` = **correlationID** (per spec). Returns `{ status, id, expiresDate }` |
| QR image (PNG) | `GET /openpix/charge/brcode/image/{paymentLinkID}.png?size=600..4096` | `CHARGE_IMAGE_GET` | Default size 1024 |
| QR image (base64) | `GET /api/image/qrcode/base64/{id}?size=` | `CHARGE_BRCODE_IMAGE_GET` | Returns `{ success, imageBase64: "data:image/png;base64,..." }` |

List pagination: the spec does **not** declare `skip` and `limit` on `GET /api/v1/charge` (it lists only `start/end/status/customer/subscription`), yet the response contains `pageInfo`, and the Node SDK passes `{ limit, skip }` (https://developers.woovi.com/en/docs/sdk/node/sdk-node-resources). Default page size and maximum limit are **UNVERIFIED**. For boleto transactions, `skip` is capped at 10000 (spec). A charge can be fetched by `correlationID`, so you rarely need to list.

### Create request body (`POST /api/v1/charge`)

Required: `correlationID` (string) and `value` (number, cents).

| Field | Type | Notes |
|---|---|---|
| `correlationID` | string, required | "Your correlation ID to keep track of this charge" |
| `value` | number, required | Cents |
| `type` | enum `DYNAMIC` \| `OVERDUE` \| `BOLETO` | Default behavior is a plain dynamic Pix charge. `OVERDUE` enables due date, fines and interest. |
| `comment` | string | Shown to the payer as `infoPagador` |
| `expiresIn` | number | Seconds. **Minimum 5 minutes (300).** The default is UNVERIFIED (the doc example shows `expiresIn: 86400` and `expiresDate = createdAt + 24h`, which suggests a 24h default) |
| `expiresDate` | string ISO 8601 | Absolute expiry. Interaction with `expiresIn` when both are sent is UNVERIFIED |
| `dueDate` | string ISO 8601 | For OVERDUE, BOLETO or subscription charges |
| `customer` | object | **Optional.** If sent, one of these combinations is required: `name`+`taxID`, `name`+`email`, or `name`+`phone`. Also accepts `correlationID`, `address{zipcode,street,number,neighborhood,city,state,complement,country}` |
| `ensureSameTaxID` | boolean | The payer taxID must equal the customer taxID |
| `fixedLocation` | boolean | Reuse the same QR for future charges (Woovi QR) |
| `paymentLinkID` | string | Links charges to the same QR (with `fixedLocation`) |
| `daysForDueDate`, `daysAfterDueDate` | number | Only for `OVERDUE` |
| `interests` | `{ value, type: FIXED\|PERCENTAGE }` | Only for `OVERDUE` (basis points) |
| `fines` | `{ value, type: FIXED\|PERCENTAGE }` | Only for `OVERDUE` (basis points) |
| `discountSettings` | object | Only for `OVERDUE`. Modalities such as `FIXED_VALUE_UNTIL_SPECIFIED_DATE`, `PERCENTAGE_UNTIL_SPECIFIED_DATE`, `*_PER_RUNNING_DAY_ADVANCE`, `*_PER_BUSINESS_DAY_ADVANCE` |
| `additionalInfo` | `[{ key, value }]` | Free-form metadata. Round-trips on the charge and in webhooks. **This is the place to carry your own IDs.** |
| `enableCashbackPercentage`, `enableCashbackExclusivePercentage` | boolean | Woovi cashback features |
| `subaccount` | string | Pix key of a subaccount that receives the charge |
| `splits` | `[{ value, pixKey, splitType: SPLIT_INTERNAL_TRANSFER\|SPLIT_SUB_ACCOUNT\|SPLIT_PARTNER }]` | Cents per split |

Customer on a charge: an `OVERDUE` charge needs a customer with `taxID` and `address`
(https://developers.woovi.com/en/docs/customer/how-to-create-customer-using-api, via search summary).

```json
{
  "correlationID": "9134e286-6f71-427a-bf00-241681624587",
  "value": 100,
  "comment": "good",
  "customer": { "name": "Dan", "taxID": "31324227036", "email": "email0@example.com", "phone": "5511999999999" },
  "additionalInfo": [
    { "key": "Product", "value": "Pencil" },
    { "key": "Order", "value": "302" }
  ]
}
```
(Verbatim from the spec's `Charge` request example.)

### Create response (`200`, not 201)

Top level: `{ "charge": {...}, "correlationID": string, "brCode": string }`.

`charge` fields from the spec `Charge` schema: `value`, `customer`, `type`, `comment`, `brCode`, `status`, `correlationID`, `paymentLinkID`, `paymentLinkUrl`, `globalID`, `transactionID`, `identifier`, `qrCodeImage`, `additionalInfo`, `pixKey`, `createdAt`, `updatedAt`, `expiresIn`, `expiresDate`, `dueDate`, `subscription`, `paymentMethods`. The doc example adds `giftbackAppliedValue`, `discount`, `valueWithDiscount` (https://developers.woovi.com/en/docs/charge/how-to-create-charge-using-api).

Composed example (field set from the spec plus values from the official `OPENPIX:CHARGE_CREATED` webhook example; key order is not authoritative):

```json
{
  "charge": {
    "customer": {
      "name": "customer#0",
      "email": "email0@entria.com.br",
      "phone": "119912345670",
      "taxID": { "taxID": "29094848074", "type": "BR:CPF" },
      "correlationID": "9134e286-6f71-427a-bf00-100000000001"
    },
    "value": 100,
    "identifier": "9134e2866f71427abf0010000",
    "correlationID": "9134e286-6f71-427a-bf00-100000000004",
    "paymentLinkID": "9134e286-6f71-427a-bf00-100000000005",
    "transactionID": "9134e2866f71427abf00100000000006",
    "status": "ACTIVE",
    "additionalInfo": [{ "key": "amount", "value": "100" }],
    "discount": 0,
    "valueWithDiscount": 100,
    "type": "DYNAMIC",
    "createdAt": "2025-09-30T15:35:13.607Z",
    "updatedAt": "2025-09-30T15:35:13.607Z",
    "ensureSameTaxID": false,
    "brCode": "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865404...",
    "expiresIn": 86400,
    "expiresDate": "2025-10-01T15:35:13.607Z",
    "pixKey": "123e4567-e12b-12d1-a456-426655440000",
    "paymentLinkUrl": "https://woovi.com/pay/9134e286-6f71-427a-bf00-100000000005",
    "qrCodeImage": "https://api.woovi.com/openpix/charge/brcode/image/9134e286-6f71-427a-bf00-100000000005.png",
    "globalID": "Q2hhcmdlOjY4ZGJmOGIxNDc5YjhhNDYyNDAxNjIyNg=="
  },
  "correlationID": "9134e286-6f71-427a-bf00-100000000004",
  "brCode": "00020126580014br.gov.bcb.pix0136123e4567-..."
}
```

Field meanings:

- **`status`**: `ACTIVE` (awaiting payment), `COMPLETED` (paid in full), `EXPIRED`. Those are the only three values in the spec enum. What a deleted charge reports is UNVERIFIED.
- **`brCode`**: Pix copy-and-paste EMV string, rendered as the QR code.
- **`paymentLinkUrl`**: hosted payment page (`https://woovi.com/pay/<paymentLinkID>` in prod, `https://woovi-sandbox.com/pay/<paymentLinkID>` in sandbox).
- **`qrCodeImage`**: PNG URL keyed by `paymentLinkID`.
- **`identifier` and `transactionID`**: in every official example they hold the same value, the Pix `txid` (32 hex characters). The spec describes `transactionID` as "unique uuid used as the txid from Pix ... This field link the charge with the transaction when paid."
- **`globalID`**: opaque Relay ID.
- `expiresIn` is typed as string in the `Charge` response schema but is an integer in every example and in webhooks. **CONFLICT**: coerce with `Number()`.
- Observed oddity: a `CHARGE_EXPIRED` example shows `paymentLinkUrl: "undefined/<id>"` (a dev-environment artifact). Do not assume the URL is always well-formed.

### Idempotency via `correlationID`

- Woovi calls `correlationID` its "chave de idempotência" (idempotency key), implemented as a body property, **not** a header: https://developers.woovi.com/en/docs/concepts/correlation-id and https://developers.woovi.com/en/docs/concepts/idempotence
- The spec adds a query flag on charge creation: `return_existing=true` makes the endpoint "idempotent, will return an existent charge if already has a one with the correlationID".
- What happens on a duplicate `correlationID` **without** `return_existing` (status code and error text) is **UNVERIFIED**. The docs never state it for charges. The Pix Out payment equivalent rejects with "Já existe um pagamento com o correlationID fornecido" (https://developers.woovi.com/docs/payment/payment-idempotency; status code also UNVERIFIED).
- Whether `return_existing` compares the payload (it could return a charge with a different `value`) is **UNVERIFIED**.
- The uniqueness scope (per account, per resource type, or global) is **UNVERIFIED**. Use a UUID.
- Practical rule: always send `return_existing=true`, or `GET /charge/{correlationID}` first and treat a 400/404 as "not found".

### Limits and notes

- A charge's `value` cannot be edited after creation. Only `expiresDate` can be patched.
- A charge pays a single Pix. Partial or over-payment behavior is **UNVERIFIED**.
- `type: BOLETO` makes the charge a boleto that is also payable by Pix, and needs the boleto feature enabled (https://developers.woovi.com/en/docs/boleto/boleto-assinatura).
- The docs also describe "Woovi Parcelado" (`type: PIX_CREDIT`) and card charges. These are out of scope here. `PIX_CREDIT` is **not** in the spec's `type` enum (**CONFLICT**).

---

## 3. Customers

Endpoints (spec):

| Operation | Method and path | Notes |
|---|---|---|
| Create | `POST /api/v1/customer` | Returns `{ "customer": {...} }` |
| Get | `GET /api/v1/customer/{id}` | `id` = **correlationID or taxID** |
| List | `GET /api/v1/customer` | Returns `{ customers: [...], pageInfo }` |
| Update | `PATCH /api/v1/customer/{id}` | `id` = **correlationID**. Body can contain `name`, `email`, `phone`, `taxID`, `address` |
| Delete | none | No delete endpoint in the spec |

Create body. Exactly one of these combinations is required (spec `oneOf`): `name`+`taxID`, `name`+`email`, or `name`+`phone`. So **`name` is always required and `taxID` is not**. Optional extras: `correlationID`, `address`.

```json
{
  "name": "Dan",
  "taxID": "31324227036",
  "email": "email0@example.com",
  "phone": "5511999999999",
  "correlationID": "9134e286-6f71-427a-bf00-241681624586",
  "address": {
    "zipcode": "30421322", "street": "Street", "number": "100",
    "neighborhood": "Neighborhood", "city": "Belo Horizonte",
    "state": "MG", "complement": "APTO", "country": "BR"
  }
}
```
(Verbatim spec example.)

Response:

```json
{
  "customer": {
    "name": "Dan",
    "email": "email0@example.com",
    "phone": "5511999999999",
    "taxID": { "taxID": "31324227036", "type": "BR:CPF" },
    "correlationID": "9134e286-6f71-427a-bf00-241681624586",
    "address": { "zipcode": "30421322", "street": "Street", "number": "100", "neighborhood": "Neighborhood", "city": "Belo Horizonte", "state": "MG", "complement": "APTO", "country": "BR" }
  }
}
```
(Shape from the spec `Customer` schema; values from the request example.)

Notes:

- `taxID` is **required in practice** (with `address`) for `OVERDUE` charges and for Pix Automático subscriptions (https://developers.woovi.com/en/docs/customer/how-to-create-customer-using-api and https://developers.woovi.com/en/docs/pix-automatic/pix-automatic-how-to-create).
- A `customer` object embedded in a **subscription** is idempotent ("if you send data of a customer that already exists, we use the existing one"): https://developers.woovi.com/en/docs/subscription-recurrence/subscription-recurrence-create-api. Whether a `customer` embedded in a **charge** or posted to `POST /customer` is also deduplicated (by taxID, correlationID or email), and what a duplicate returns, is **UNVERIFIED**.
- There is no customer metadata field. Carry your own ID in `correlationID`.

---

## 4. Subscriptions and recurring billing

Woovi has **one subscription resource** (`/api/v1/subscriptions`) covering two different mechanisms. Official pages:
https://developers.woovi.com/en/docs/subscription-recurrence/subscription-recurrence-create-api,
https://developers.woovi.com/en/docs/pix-automatic/pix-automatic-how-to-create,
https://developers.woovi.com/en/docs/pix-automatic/pix-automatic-state-machine.

| `type` | What it is | Who initiates each payment |
|---|---|---|
| `RECURRENT` | Woovi generates a normal charge (Pix, `OVERDUE`, or `BOLETO` per `chargeType`) every cycle and the customer pays it manually | The customer, each cycle |
| `PIX_RECURRING` | **Pix Automático** (Banco Central recurring Pix). The payer authorizes a mandate once in their bank app and the merchant's recurring charges (CobR) are debited automatically | Woovi, via the mandate |

The response schema also lists `IN_INSTALLMENT` and `PIX_CREDIARY` types, which the create request does not accept (only `PIX_RECURRING` and `RECURRENT`).

### Endpoints

| Operation | Method and path | Notes |
|---|---|---|
| Create | `POST /api/v1/subscriptions` | Returns `{ "subscription": {...} }` |
| Get | `GET /api/v1/subscriptions/{id}` | `id` = **globalID or correlationID** |
| List | `GET /api/v1/subscriptions` | Returns `{ subscriptions, pageInfo }` |
| Cancel | `PUT /api/v1/subscriptions/{id}/cancel` | No request body. The 200 response body schema is empty/untyped (**UNVERIFIED** what it returns) |
| Update value | `PUT /api/v1/subscriptions/{id}/value` | Changes the value of upcoming installments. Only possible if Pix Automático accepts dynamic value. Request body is **not declared in the spec** (UNVERIFIED) |
| List installments | `GET /api/v1/subscriptions/{id}/installments` | `id` = subscription **globalID** |
| Get installment | `GET /api/v1/installments/{id}` | `id` = installment globalID **or the `endToEndId` of the transaction** |
| Create CobR manually | `POST /api/v1/installments/{id}/cobr` | Body `{ "value": cents }` (optional) |
| Retry CobR manually | `POST /api/v1/installments/{id}/cobr/retry` | Body `{ "value": cents }` (optional) |
| Payment book (carnê) | `GET /api/v1/subscriptions/{id}/payment-book` | Not researched in depth |

### Create request body

| Field | Type | Notes |
|---|---|---|
| `customer` | object, **required** | `{ name, email, phone, taxID, address{...} }`. Address is **mandatory for Pix Automático** ("É obrigatório o envio do endereço do cliente"). Customer is idempotent (existing customer is reused) |
| `value` | number, **required** | Cents |
| `type` | enum `PIX_RECURRING` \| `RECURRENT`, **required** per the spec | The docs' basic example omits `type` and the spec marks it required. **CONFLICT** (send it explicitly) |
| `correlationID` | string, **required** per the spec | Your idempotency/tracking key. Duplicate behavior UNVERIFIED |
| `name` | string | Subscription name |
| `comment` | string | Shown in the QR. For Pix Automático it becomes the **mandate contract text and must be under 30 characters**. The payer's bank app shows your CNPJ legal name, not the comment |
| `frequency` | enum `WEEKLY` \| `MONTHLY` \| `BIMONTHLY` \| `QUARTERLY` \| `SEMIANNUALLY` \| `ANNUALLY` | Defaults to `MONTHLY`. **`BIMONTHLY` is not allowed for `PIX_RECURRING`** (Banco Central rule) |
| `dayGenerateCharge` | number or ISO date-time | Spec: day of month `1..31` (default 5) **or** a full UTC date for the first charge generation (the day-of-month is then extracted for later cycles). **CONFLICT**: the RECURRENT docs page says `0..27`. If the day does not exist in a month, the last day of that month is used |
| `dayDue` | number, default 7, min 3 | Days a generated charge takes to expire after generation |
| `installmentCount` | number | Optional fixed number of installments. Without it the subscription is open-ended (`installmentsCount: null` in responses) |
| `additionalInfo` | `[{key,value}]` | Metadata |
| `chargeType` | enum `DYNAMIC` \| `OVERDUE` \| `BOLETO` | Only for `RECURRENT`. Default `DYNAMIC`. `BOLETO` needs the boleto feature enabled |
| `pixRecurringOptions` | object | Only for `PIX_RECURRING`, see below |

`pixRecurringOptions`:

- `journey`: `ONLY_RECURRENCY` (journey 2: only the mandate is registered, the first charge happens on the start date, which must be **at least 3 days from today**) or `PAYMENT_ON_APPROVAL` (journey 3: authorization plus payment of the first installment in one step, and `dayGenerateCharge` must be **today**).
- `retryPolicy`: `NON_PERMITED` (no retries; the spelling is Woovi's) or `THREE_RETRIES_7_DAYS` (up to 3 retries: 1 day after the charge date, at the midpoint, and on the expiry date).
- `minimumValue`: number (cents), minimum for variable-value CobRs.
- `splits[]`: `{ destination: {type: PIX_KEY|SUB_ACCOUNT|COMPANY_BANK_ACCOUNT, pixKey|companyBankAccountId}, value|percentage, description }`. Needs the split feature enabled by Woovi support.

Example (verbatim from the spec, Pix Automático):

```json
{
  "name": "Pix Automático",
  "value": 100,
  "customer": {
    "name": "Dan", "taxID": "31324227036", "email": "email0@example.com", "phone": "5511999999999",
    "address": { "zipcode": "04556300", "street": "rua de são paulo", "number": "3432", "neighborhood": "BROOKLIN PAULISTA", "city": "SAO PAULO", "state": "SP", "complement": "CONJ 26" }
  },
  "correlationID": "My-UniqueID",
  "comment": "Comentários",
  "frequency": "WEEKLY",
  "type": "PIX_RECURRING",
  "pixRecurringOptions": { "journey": "ONLY_RECURRENCY", "retryPolicy": "NON_PERMITED" },
  "dayGenerateCharge": 25,
  "dayDue": 3
}
```

Example (verbatim from the spec, boleto subscription):

```json
{ "name": "Assinatura Boleto", "value": 15000, "type": "RECURRENT", "chargeType": "BOLETO", "frequency": "MONTHLY", "correlationID": "My-UniqueID", "dayGenerateCharge": 25, "dayDue": 3,
  "customer": { "name": "Dan", "taxID": "31324227036", "email": "email0@example.com", "phone": "5511999999999", "address": { "zipcode": "04556300", "street": "rua de são paulo", "number": "3432", "neighborhood": "BROOKLIN PAULISTA", "city": "SAO PAULO", "state": "SP", "complement": "CONJ 26" } } }
```

### Subscription object (response)

Spec `Subscription` schema fields: `globalID`, `value`, `name`, `customer`, `dayGenerateCharge`, `type`, `frequency`, `installmentsCount` (number or null), `isActive`, `status`, `correlationID`, `paymentLinkUrl`, `addtionalInfo` (sic, typo in the response; the request field is `additionalInfo`), `pixRecurringOptions{ emv, status, retryPolicy, journey }`.

- **CONFLICT**: the Pix Automático docs response and all webhook payloads call the nested object **`pixRecurring`** (`{ recurrencyId, emv, journey, status }`), whereas the spec's response schema calls it `pixRecurringOptions`. Parse both.
- `status` in the spec enum is `ACTIVE | COMPLETED | EXPIRED`, but the state-machine page and webhook examples also use `INACTIVE` (cancelled or mandate rejected). Treat `status` as an open string.
- `pixRecurring.status` (the mandate): `CREATED` (initial), `APPROVED` (payer approved in bank app), `REJECTED` (payer revoked, possible at any time), `CANCELED` (merchant cancelled). The spec enum is `CREATED | CANCELED | APPROVED | EXPIRED | REJECTED`.
- `pixRecurring.emv` is the Pix copy-and-paste string for the **authorization** QR (it references both `/cob/` and `/rec/` locations). The payer approves by scanning it or by opening `paymentLinkUrl` (that this is the authorization UX is inferred from the response shape; the webhooks page states the payer scans the QR and authorizes).

### How charges are generated

**Pix Automático (`PIX_RECURRING`)** (https://developers.woovi.com/en/docs/pix-automatic/pix-automatic-state-machine and https://developers.woovi.com/en/docs/pix-automatic/webhooks/pix-automatic-webhooks):

1. On creation, the first **installments** are created immediately with status `SCHEDULED` (dates derived from `dayGenerateCharge`).
2. The payer approves the mandate (`PIX_AUTOMATIC_APPROVED`). Charge creation then begins.
3. For each installment, Woovi creates a **CobR** (recurring charge) **4 days before** the charge date by default and sends it to the payer's bank (`PIX_AUTOMATIC_COBR_CREATED`), which accepts it (`..._COBR_APPROVED`) or rejects it.
4. On the charge date the payer's account is debited (`PIX_AUTOMATIC_COBR_COMPLETED`, which carries `cobr.endToEndId`).
5. If a try fails, `retryPolicy` decides on retries (`PIX_AUTOMATIC_COBR_TRY_REJECTED` per failed attempt, `..._TRY_REQUESTED` per retry). After all tries fail, `PIX_AUTOMATIC_COBR_REJECTED` fires **once**.
6. You can create or retry a CobR manually: `POST /installments/{id}/cobr` and `.../cobr/retry` (https://developers.woovi.com/en/docs/pix-automatic/pix-automatic-cobr-manual).

Statuses:

| Entity | Values |
|---|---|
| Installment | `SCHEDULED`, `ACTIVE` (CobR accepted by the bank), `COMPLETED`, `EXPIRED`, `CANCELED` |
| CobR (`cobr.status`) | `CREATED`, `ACTIVE`, `CONCLUDED`, `FAILED_TRY`, `REJECTED`, `CANCELED` |
| CobR try (`tries[].tryStatus`) | `REQUESTED`, `SCHEDULED`, `PAID`, `REJECTED` |

Observed value drift: webhook examples show installment `status` of `COMPLETED` and `CANCEL`/`CANCELED` and CobR `status` of `COMPLETED` (state machine says `CONCLUDED`). **Do not hard-match status strings**; key off the event name.

Installment object (spec `Installment`): `dateGenerateCharge`, `expiration` (seconds), `installmentNumber`, `value`, `status`, `createdAt`, `cobr{ identifierId, recurrencyId, installmentId, endToEndId, rejectCode, status, value, tries[{tryStatus, finalityPurpose, rejectCode, value, requestedExecutionDate, createdAt, updatedAt}], paymentDate, chargeDate, expiryDate, description, createdAt }`, `paymentSubscriptionGlobalID`, `correlationID`, `globalID`.

**Plain `RECURRENT` subscriptions:** Woovi generates a new charge each cycle (a boleto with an attached Pix QR when `chargeType: BOLETO`). Charges carry a `subscription` object and can be listed with `GET /charge?subscription=<subscription correlationID>`. The docs state that when the boleto of an installment is paid, `OPENPIX:CHARGE_COMPLETED` fires (https://developers.woovi.com/en/docs/subscription-recurrence/subscription-with-boleto-create-api). That the same `OPENPIX:CHARGE_CREATED`, `_COMPLETED` and `_EXPIRED` events fire for plain-Pix `RECURRENT` charges, and the exact payload linking a charge to its subscription, is **UNVERIFIED** (the page does not list webhooks, and I found no example payload with `charge.subscription` populated).

### Cancel and lifecycle gotchas

- Cancel: `PUT /api/v1/subscriptions/{id}/cancel`. Per the state machine, the subscription becomes `INACTIVE` and the mandate `CANCELED` (**UNVERIFIED** that the API response reflects this).
- **There is no webhook for a merchant-initiated cancellation.** The event enum has no `PIX_AUTOMATIC_CANCELED` or `SUBSCRIPTION_*` events. Update local state yourself after a successful cancel call.
- **There are no subscription lifecycle webhooks for `RECURRENT` subscriptions** at all. Only per-charge events.
- A payer-side revocation is `PIX_AUTOMATIC_REJECTED` (the webhooks page describes it as the payer declining; the state machine describes `APPROVED -> REJECTED` as the payer revoking. Both are likely the same event, **UNVERIFIED**).
- The full reject-code list is not documented. Only `DTED` (on `COBR_REJECTED`) and `FBRD` (on `TRY_REJECTED`/`TRY_REQUESTED`) appear in examples.
- Whether Pix Automático requires a feature flag or account approval is **UNVERIFIED**. Split on Pix Automático explicitly requires enabling by support.

---

## 5. Refunds

There are **two refund APIs** with different identifiers and different status enums.

### A. Refund by charge: `POST /api/v1/charge/{id}/refund`

Docs: https://developers.woovi.com/en/docs/refund/charge-refund-create-api, https://developers.woovi.com/en/docs/refund/charge-refund-get-all-api

- `{id}` is the **charge's correlationID** (URI-encoded).
- Body:

```json
{ "correlationID": "a273e72c-9547-4c75-a213-3b0a2735b8d5", "value": 100, "comment": "Comentário do reembolso" }
```

- `correlationID` (required): **the refund's own idempotency ID, not the charge's.**
- `value` (cents, optional): omitted means the full charge value, or the remaining un-refunded value. Partial refunds are supported.
- `comment`: max 140 characters.
- Response `200`: `{ "refund": { "value", "status": "IN_PROCESSING"|"CONFIRMED"|"REJECTED", "correlationID", "endToEndId", "time", "comment" } }`
- List: `GET /api/v1/charge/{id}/refund` returns `{ "refunds": [ ...same shape ] }`.

### B. Refund by transaction: `POST /api/v1/refund`

```json
{ "transactionEndToEndId": "9134e286-6f71-427a-bf00-241681624586", "correlationID": "9134e286-6f71-427a-bf00-241681624586", "value": 100, "comment": "Comentário do reembolso" }
```

- Response `200`: `{ "refund": { "value", "status": "IN_PROCESSING"|"REFUNDED"|"NOT_ACCOMPLISHED", "correlationID", "refundId", "time", "comment" } }`
- `GET /api/v1/refund/{id}` (id = refund ID or correlationID) returns `{ "pixTransactionRefund": {...} }` (note the different wrapper key). `GET /api/v1/refund` lists. `GET /api/v1/transaction/{endToEndId}/refund` lists the refunds of one transaction.

### Gotchas

- **CONFLICT** in status vocab between A (`CONFIRMED`/`REJECTED`) and B (`REFUNDED`/`NOT_ACCOMPLISHED`).
- Refund webhooks (`PIX_TRANSACTION_REFUND_SENT_CONFIRMED` and friends, section 6) carry the refund's `endToEndId` and the `originalTransaction.endToEndId`, but **not** the refund `correlationID` you supplied. To link a refund webhook back to your record, store the `endToEndId` returned by the create call (path A) and also the original payment's `pix.endToEndId` from the `CHARGE_COMPLETED` webhook.
- A refund time limit (for example 90 days) is **UNVERIFIED**. I could not find it in the docs.
- "Recuperação de fundos (MED)" (`/api/v1/funds-recovery`) is a different, fraud-related process and not a normal refund.

---

## 6. Webhooks

### Management API

| Operation | Method and path | Scope |
|---|---|---|
| Create | `POST /api/v1/webhook` | `WEBHOOK_POST` |
| List | `GET /api/v1/webhook?url=<filter>` | `WEBHOOK_GET_LIST` |
| Delete | `DELETE /api/v1/webhook/{id}` | `WEBHOOK_DELETE` (returns `{ "status": "..." }`) |
| List event names | `GET /api/v1/webhook/events` | `WEBHOOK_EVENTS_GET_LIST` |
| Sender IPs | `GET /api/v1/webhook/ips` | `WEBHOOK_IPS_GET` (needs AppID) |
| Public signing keys | `GET /api/v1/webhook/public-keys` | **no auth** |

Create body: **one event per webhook registration.** `event` is a single enum value, so you must register one webhook per event.

```json
{
  "webhook": {
    "name": "paguekit charge completed",
    "event": "OPENPIX:CHARGE_COMPLETED",
    "url": "https://example.com/api/webhooks/woovi",
    "authorization": "my-shared-secret",
    "isActive": true
  }
}
```

Response: `{ "webhook": { "id", "name", "event", "url", "authorization", "isActive", "createdAt", "updatedAt" } }`.

- If `event` is omitted, the default is `OPENPIX:TRANSACTION_RECEIVED`.
- `authorization`: a custom value Woovi sends back to your endpoint in the `Authorization` header (the boleto-webhook page says `Authorization` / `x-openpix-authorization`: https://developers.woovi.com/en/docs/boleto/boleto-webhook). Custom extra headers are only configurable in the dashboard (https://developers.woovi.com/en/docs/webhook/webhook-headers).
- **CONFLICT**: the docs page https://developers.woovi.com/en/docs/webhook/webhook-api shows `POST https://api.woovi.com/api/openpix/v1/webhook`. The spec says `/api/v1/webhook`. My unauthenticated probe of both paths on prod returned the same `401`, so both routes exist. Use the spec path.
- There is no `secret` or HMAC-key field in the create schema, so the HMAC secret (legacy signature) is **dashboard-only** (UNVERIFIED that no API exists).
- Whether Woovi pings the URL on creation and requires a 200: the docs describe a test request sent when a webhook is created, with body `{"data_criacao":"2024-01-23T20:32:14.429Z","event":"OPENPIX:CHARGE_COMPLETED"}` (the `event` is whichever event you selected). **Your handler must return 200 for this body**, which has no `charge` or `pix` object. Source: https://developers.woovi.com/en/docs/webhook/webhook-test
- Constraints such as one webhook per event or per URL, or a maximum number of webhooks, are **UNVERIFIED**.

### Delivery semantics

Source: https://developers.woovi.com/en/docs/webhook/webhook-retry, https://developers.woovi.com/en/docs/webhook/webhook-timeout, https://developers.woovi.com/en/docs/boleto/boleto-webhook

- Method `POST`, `Content-Type: application/json`. Respond **2xx**, quickly, and process asynchronously.
- **Timeout: 100 seconds**, after which Woovi cancels the request.
- **Retries: 8** on a non-2xx, an unreachable URL, or an internal Woovi error. Backoff table (seconds): 10, 20, 40, 80, 160, 320, 640, 1280 (the page's formula `10 * 2^attempt` disagrees with its own table; the table fits `10 * 2^(n-1)`). That is about 42 minutes of retrying in total. Whether the 8 includes the first attempt is unclear.
- After all retries fail, the event is **not** retried further. A **manual resend from the dashboard** is possible (https://developers.woovi.com/en/docs/webhook/webhook-resend). Automatic webhook deactivation after repeated failures is **UNVERIFIED** (not mentioned).
- **At-least-once delivery.** The same event may arrive more than once. Dedupe on `charge.correlationID` + `event`.
- **No envelope event ID or timestamp.** Top-level keys are domain objects plus `event`. The only identifiers are inside the payload (`charge.correlationID`, `charge.globalID`, `pix.endToEndId`, `pix.globalID`, `globalID` for subscription events). Order is not guaranteed.
- `account.environment` is `"PRODUCTION"` or `"TESTING"` on charge events. Use it to refuse sandbox events in production.
- Sender IPs are available from `GET /api/v1/webhook/ips`. Woovi warns IPs change often and recommends signature verification over IP allow-listing (https://dev.to/woovi/webhook-security-approaches-5h22).

### Signature verification

There are two mechanisms. Use the first.

**1. `x-webhook-signature` (RSA-SHA256), the recommended method.** Docs: https://developers.woovi.com/en/docs/webhook/seguranca/webhook-signature-validation and https://developers.woovi.com/en/docs/webhook/seguranca/webhook-public-keys

- Header: `x-webhook-signature` (present on all Woovi webhooks).
- Algorithm: `signature = base64( RSA-SHA256( woovi_private_key, raw_request_body_bytes ) )`. Verify with Woovi's **public** key (PKCS#1 v1.5 with SHA-256).
- Verify over the **raw body bytes**, before JSON parsing. Re-serializing changes bytes and breaks the signature.
- The public key is the same for all Woovi webhooks and is published in the docs and by an unauthenticated endpoint: `GET /api/v1/webhook/public-keys`.
- The response is a list so Woovi can rotate keys: `{ "public_keys": [ { "key_identifier": "<sha256 of key DER, hex>", "key": "<PEM SPKI>", "is_current": true } ] }`. During rotation both old and new keys are listed. **Accept a signature valid under any listed key**, and fetch the list rather than hard-coding it.
- I fetched `GET /api/v1/webhook/public-keys` from **both** `api.woovi.com` and `api.woovi-sandbox.com` on 2026-10-19. Both returned the same single key. I also confirmed that `key_identifier` equals the SHA-256 of the key's DER encoding (checked locally with openssl). The key is **RSA 1024-bit**:

```json
{
  "public_keys": [
    {
      "key_identifier": "9dce618794f8986c603915a51b7029126c260e5cfdb2aa47e131d837fd62311c",
      "is_current": true,
      "key": "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/+NtIkjzevvqD+I3MMv3bLXDt\npvxBjY4BsRrSdca3rtAwMcRYYvxSnd7jagVLpctMiOxQO8ieUCKLSWHpsMAjO/zZ\nWMKbqoG8MNpi/u3fp6zz0mcHCOSqYsPUUG19buW8bis5ZZ2IZgBObWSpTvJ0cnj6\nHKBAA82Jln+lGwS1MwIDAQAB\n-----END PUBLIC KEY-----\n"
    }
  ]
}
```

Node verification, following the official example (`createVerify('sha256')`, base64 signature):

```ts
import { createVerify } from 'node:crypto';

export function verifyWooviSignature(rawBody: string | Buffer, signatureB64: string, publicKeysPem: string[]): boolean {
  return publicKeysPem.some((pem) => {
    const v = createVerify('sha256');
    v.update(rawBody);
    v.end();
    return v.verify(pem, signatureB64, 'base64');
  });
}
```

Caveat: the docs example does `Buffer.from(payload)`, which for a JS string means UTF-8 bytes. Feed the original request bytes. Whether Woovi ever signs a different byte sequence than it sends (for example after proxy re-encoding) is **UNVERIFIED**.

**2. `X-OpenPix-Signature` (HMAC-SHA1), deprecated.** Docs: https://developers.woovi.com/en/docs/boleto/boleto-webhook (the sidebar labels it "HMAC-SHA1 (Depreciado)").

- Sent only if an HMAC secret key is configured on the webhook (dashboard).
- Algorithm: `base64( HMAC-SHA1( key = your webhook secret, message = raw body ) )`.
- Proves the call comes from *your* webhook configuration, not just from Woovi.

**3. `authorization` header** (shared secret you set at create time). Weak (not tamper-proof, leaks need rotation), but simple to check as defense in depth.

### Event names (`WebhookEventEnum`, 52 values)

Source: spec `components.schemas.WebhookEventEnum` and https://developers.woovi.com/en/docs/webhook/webhook-events-type.

Charges and Pix in:
`OPENPIX:CHARGE_CREATED`, `OPENPIX:CHARGE_COMPLETED`, `OPENPIX:CHARGE_EXPIRED`, `OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER`, `OPENPIX:TRANSACTION_RECEIVED`

Refunds:
`PIX_TRANSACTION_REFUND_RECEIVED_CONFIRMED`, `PIX_TRANSACTION_REFUND_RECEIVED_REJECTED`, `PIX_TRANSACTION_REFUND_SENT_CONFIRMED`, `PIX_TRANSACTION_REFUND_SENT_REJECTED`, `OPENPIX:TRANSACTION_REFUND_RECEIVED` (deprecated)

Pix Automático (subscription family):
`PIX_AUTOMATIC_APPROVED`, `PIX_AUTOMATIC_REJECTED`, `PIX_AUTOMATIC_COBR_CREATED`, `PIX_AUTOMATIC_COBR_APPROVED`, `PIX_AUTOMATIC_COBR_REJECTED`, `PIX_AUTOMATIC_COBR_COMPLETED`, `PIX_AUTOMATIC_COBR_TRY_REQUESTED`, `PIX_AUTOMATIC_COBR_TRY_REJECTED`

Other (not needed for billing):
`OPENPIX:MOVEMENT_CONFIRMED|FAILED|REMOVED` (Pix out payments), `OPENPIX:DISPUTE_CREATED|ACCEPTED|REJECTED|CANCELED`, `BOLETO_SETTLED`, `TED_IN_CONFIRMED|REJECTED`, `TED_OUT_CONFIRMED|REJECTED`, `TED_REFUND_SENT_CONFIRMED`, `TED_REFUND_RECEIVED_CONFIRMED`, `ACCOUNT_REGISTER_*` (APPROVED, REJECTED, PENDING, STEP_UPDATED, IN_REVIEW, DOCUMENTS_REQUESTED, RFI_RESOLVED), `COMPANY_BANK_ACCOUNT_BLOCKED`, `STABLECOIN_*`, `PIX_AUTH_COMPLETED|EXPIRED`, `KYC_VALIDATION_COMPLETED|FAILED`

Spec inconsistencies: `KYC_VALIDATION_COMPLETED` and `KYC_VALIDATION_FAILED` are in the enum but have no documented payload. `TED_REFUND_SENT_REJECTED` has a documented payload but is missing from the enum.

Minimal set for a billing adapter: `OPENPIX:CHARGE_COMPLETED`, `OPENPIX:CHARGE_EXPIRED`, `OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER`, `PIX_TRANSACTION_REFUND_SENT_CONFIRMED`, `PIX_TRANSACTION_REFUND_SENT_REJECTED`, `PIX_AUTOMATIC_APPROVED`, `PIX_AUTOMATIC_REJECTED`, `PIX_AUTOMATIC_COBR_COMPLETED`, `PIX_AUTOMATIC_COBR_REJECTED`, plus optionally `OPENPIX:CHARGE_CREATED`, `PIX_AUTOMATIC_COBR_CREATED`, `PIX_AUTOMATIC_COBR_TRY_REJECTED`, `PIX_AUTOMATIC_COBR_TRY_REQUESTED`. Each is a separate `POST /webhook` registration.

### Example payloads

All examples below come from the official spec's `webhooks` section (some fields trimmed).

**`OPENPIX:CHARGE_COMPLETED`** (a charge paid in full; the sandbox example):

```json
{
  "event": "OPENPIX:CHARGE_COMPLETED",
  "charge": {
    "value": 1,
    "comment": "",
    "identifier": "d983a07836cf48ed9a65764d3c184273",
    "transactionID": "d983a07836cf48ed9a65764d3c184273",
    "status": "COMPLETED",
    "additionalInfo": [],
    "fee": 85,
    "discount": 0,
    "valueWithDiscount": 1,
    "expiresDate": "2025-09-25T15:08:12.278Z",
    "type": "DYNAMIC",
    "correlationID": "3f2a2690-8224-4aae-a1ba-ed26d4d61f81",
    "paymentLinkID": "788c8d0d-182b-468e-942e-546be6a621c2",
    "createdAt": "2025-09-24T15:07:47.334Z",
    "updatedAt": "2025-09-24T15:08:13.578Z",
    "customer": { "name": "Cliente Teste", "taxID": { "taxID": "44720743000101", "type": "BR:CNPJ" }, "correlationID": "ecd41c3b-487c-4719-b9f7-53b6dd6759cb" },
    "paidAt": "2025-09-24T15:07:50.891Z",
    "payer": null,
    "ensureSameTaxID": false,
    "brCode": "00020101021226980014br.gov.bcb.pix2576api.woovi-sandbox.com/api/testaccount/qr/v1/d983a078...",
    "expiresIn": 86424,
    "pixKey": "67856db0-ac6e-4276-8309-503a22a896dc",
    "paymentLinkUrl": "https://woovi-sandbox.com/pay/788c8d0d-182b-468e-942e-546be6a621c2",
    "qrCodeImage": "https://api.woovi-sandbox.com/openpix/charge/brcode/image/788c8d0d-182b-468e-942e-546be6a621c2.png",
    "globalID": "Q2hhcmdlOjY4ZDQwOTQzMDY5YTI4ZjgzMTEzOTVkZA=="
  },
  "pix": {
    "customer": { "name": "Cliente Teste", "taxID": { "taxID": "44720743000101", "type": "BR:CNPJ" }, "correlationID": "ecd41c3b-487c-4719-b9f7-53b6dd6759cb" },
    "payer": { "name": "Cliente Teste", "taxID": { "taxID": "44720743000101", "type": "BR:CNPJ" }, "correlationID": "ecd41c3b-487c-4719-b9f7-53b6dd6759cb" },
    "value": 1,
    "time": "2025-09-24T15:07:50.891Z",
    "endToEndId": "Efa8df7c628cf43d2af424696ea0c6444",
    "transactionID": "d983a07836cf48ed9a65764d3c184273",
    "infoPagador": "OpenPix testing",
    "status": "CONFIRMED",
    "type": "PAYMENT",
    "createdAt": "2025-09-24T15:07:50.915Z",
    "globalID": "UGl4VHJhbnNhY3Rpb246NjhkNDA5NDYwNjlhMjhmODMxMTM5NjU4"
  },
  "company": { "id": "6810ce3b892866f103d77ef2", "name": "Lucas Aprigio Sandbox", "taxID": "57437573000102" },
  "account": { "environment": "TESTING" }
}
```

Notes: `charge.fee` is Woovi's fee in cents (85 here). `charge.payer` can be `null` while `pix.payer` is populated. Boleto payments reuse this event with a `boleto` object and no `pix` object (https://developers.woovi.com/en/docs/boleto/boleto-webhook).

**`OPENPIX:CHARGE_EXPIRED`**: same `charge` object with `"status": "EXPIRED"`, plus `company` and `account` (no `pix`).

**`OPENPIX:CHARGE_CREATED`**: same `charge` object with `"status": "ACTIVE"` (see the example in section 2), plus `company` and `account`.

**`OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER`**: "A charge was paid by a payer whose taxID differs from the charge customer. Only sent when the charge does not enforce the same taxID." Carries `charge`, `pix`, `company`, `account`, `payer`. Whether `OPENPIX:CHARGE_COMPLETED` **also** fires in that case is **UNVERIFIED**. Safe approach: subscribe to both and treat either as "paid", deduped by `charge.correlationID`.

**`OPENPIX:TRANSACTION_RECEIVED`** (any Pix credit, charge or not): `{ event, charge|null, pixQrCode|null, pix{ debitParty, creditParty, payer, value, time, endToEndId, fee, status, type, createdAt, pixKey, globalID }, company, account, refunds[] }`. `charge` is null when the Pix arrived without a charge.

**`PIX_TRANSACTION_REFUND_SENT_CONFIRMED`** (and `..._RECEIVED_CONFIRMED`, same shape; `..._REJECTED` variants for failures):

```json
{
  "event": "PIX_TRANSACTION_REFUND_SENT_CONFIRMED",
  "refundTransaction": {
    "value": 10001, "time": "2025-08-14T21:31:49.755Z", "endToEndId": "D548114172025081421318FbVaF2LTWr",
    "status": "CONFIRMED", "type": "REFUND", "partial": false,
    "createdAt": "2025-08-14T21:31:49.821Z", "globalID": "UGl4VHJhbnNhY3Rpb246Njg5ZTU1YzVkNDEzYTJhYzZmMWRlMDcz"
  },
  "originalTransaction": {
    "value": 10001, "time": "2025-08-14T15:43:33.000Z", "endToEndId": "E31680151202508141543GVL7OCT44VU",
    "status": "CONFIRMED", "type": "PAYMENT", "payer": { "name": "Sapataria Xiq Bom", "taxID": { "taxID": "06888687000120", "type": "BR:CNPJ" }, "correlationID": "862adf9d-aae6-407e-86ba-5948d87ed591" }
  },
  "company": { "id": "6762e45c55eb2e0a3b3cbc44", "name": "MAGAZINE LUIZA S/A", "correlationID": "f7b21ff8-a0b0-4e6a-929c-c5c483174578" },
  "account": { "id": "67a4bb7a7c9720a18b10648a", "status": "OPEN", "branch": "0001", "account": "00000000000000000221" }
}
```

(Trimmed; the full payload also includes `debitParty` and `creditParty` blocks. The refund `endToEndId` begins with `D`, the original payment's with `E`.) The `refundTransaction.partial` boolean distinguishes partial refunds.

**`PIX_AUTOMATIC_APPROVED`** (the mandate was approved; `PIX_AUTOMATIC_REJECTED` has the same shape with `"status": "INACTIVE"` and `pixRecurring.status: "REJECTED"`):

```json
{
  "event": "PIX_AUTOMATIC_APPROVED",
  "customer": { "name": "Dan", "email": "email0@example.com", "phone": "+5511999999999", "taxID": { "taxID": "111111111", "type": "BR:CPF" }, "correlationID": "6f4131ea-b816-4b08-8ba6-11cf6b622a6e", "address": { "zipcode": "04556300", "country": "BR" } },
  "dayGenerateCharge": 24,
  "value": 100,
  "status": "ACTIVE",
  "correlationID": "UniqueID1344445457t11653453223241",
  "pixRecurring": { "recurrencyId": "RN5481141720250822YHKirVyWBjF", "emv": "qrcode", "journey": "ONLY_RECURRENCY", "status": "APPROVED" },
  "globalID": "UGF5bWVudFN1YnNjcmlwdGlvbjo2OGE4ODMyMWQ2NWNiMmQ1MDdhMmVlMjk="
}
```

(`customer.address` trimmed.) Here `correlationID` is **your** subscription correlationID and `globalID` is the subscription's.

**`PIX_AUTOMATIC_COBR_COMPLETED`** (an installment was paid; `_CREATED`, `_APPROVED`, `_REJECTED`, `_TRY_REQUESTED`, `_TRY_REJECTED` share this shape):

```json
{
  "event": "PIX_AUTOMATIC_COBR_COMPLETED",
  "dateGenerateCharge": "2025-08-24T12:00:00.000Z",
  "expiration": 259200,
  "installmentNumber": 1,
  "value": 100,
  "status": "COMPLETED",
  "createdAt": "2025-08-22T14:48:02.697Z",
  "cobr": {
    "identifierId": "01K3942Y0DFEK73H541ZADVK0P",
    "recurrencyId": "RN5481141720250822YHKirVyWBjF",
    "status": "COMPLETED",
    "endToEndId": "my-end-to-end-id",
    "tries": [ { "tryStatus": "PAID", "value": 1, "finalityPurpose": "AGND", "requestedExecutionDate": "2025-09-05T12:00:00.000Z", "createdAt": "2025-09-04T03:01:58.543Z", "updatedAt": "2025-09-04T03:04:03.921Z" } ],
    "value": 100,
    "createdAt": "2025-08-22T14:49:22.702Z"
  },
  "correlationID": "9134e286-6f71-427a-bf00-100000000005",
  "paymentSubscriptionGlobalID": "UGF5bWVudFN1YnNjcmlwdGlvbjo2OGFjYmNkNGE5NTY1M2VmMjQzYjY2Zjc=",
  "globalID": "UGF5bWVudFN1YnNjcmlwdGlvbkluc3RhbGxtZW50OjY4YTg4MzIyZDY1Y2IyZDUwN2EyZWUzYg=="
}
```

Identifier semantics in the COBR events (https://developers.woovi.com/en/docs/pix-automatic/webhooks/pix-automatic-webhooks):

- `globalID` is the **installment's** ID.
- `paymentSubscriptionGlobalID` links back to the **subscription's** `globalID`.
- `cobr.recurrencyId` is the Pix-side mandate ID and is shared with `pixRecurring.recurrencyId` in the subscription events, so it also links the two families.
- **The top-level `correlationID` in a COBR event is the installment's own correlationID**, not your subscription's `correlationID` (the examples show different values: the subscription event has `UniqueID1344445457t11653453223241`, the COBR events have a UUID). **UNVERIFIED** which one the docs mean ("your unique identifier sent when creating the subscription" per the webhooks page, but the examples contradict it). Link by `paymentSubscriptionGlobalID` and the `globalID` returned at subscription creation, and store that `globalID` on creation.

Doc defects on the Pix Automático webhook pages: the `TRY_REQUESTED` example sets `"event": "PIX_AUTOMATIC_COBR_TRY_REJECTED"`, and the `COBR_REJECTED` example uses `"status": "CANCEL"` while the state machine says `CANCELED`.

---

## 7. Sandbox

### Environment

- Separate host `https://api.woovi-sandbox.com`, separate dashboard `https://app.woovi-sandbox.com/`, separate sign-up, separate AppIDs, separate data (https://developers.woovi.com/en/docs/test-environment).
- Paths and payloads are the same as production. Sandbox webhook payloads carry `"account": { "environment": "TESTING" }`.
- A sandbox charge's `brCode` points to a Woovi test QR (`api.woovi-sandbox.com/api/testaccount/qr/v1/...`), so it is not payable from a real bank app. `paymentLinkUrl` and `qrCodeImage` use `woovi-sandbox.com` and `api.woovi-sandbox.com`.
- Both the production and sandbox hosts serve the same public signing key, and the docs say the key is the same for all Woovi webhooks. That sandbox *deliveries* are signed with it is therefore very likely, but I could not observe a real sandbox delivery (**UNVERIFIED**).

### Simulating a Pix payment on a charge: `GET /openpix/testing`

Docs: https://developers.woovi.com/en/docs/test-environment/test-account/test-pay-pix (charge) and https://developers.woovi.com/en/docs/test-environment/test-account/test-pay-pix-qrcode (static QR).

```bash
curl 'https://api.woovi-sandbox.com/openpix/testing?transactionID=<charge.transactionID>' \
  -H 'Authorization: <sandbox AppID>'
```

- Method: GET (the docs show a bare curl, so GET by default; the doc does not name the method). My unauthenticated probe of `GET https://api.woovi-sandbox.com/openpix/testing?transactionID=x` returned `401 {"data":null,"errors":[{"message":"Invalid appID"}]}`, which confirms the route exists on the **sandbox host**.
- **CONFLICT on host**: the docs print `https://api.woovi.com/openpix/testing?...`. My unauthenticated probe of the same path on `api.woovi.com` returned `404 Not Found`. Use the **sandbox** host with a sandbox AppID.
- Parameter: `transactionID` takes the charge's `identifier`/`transactionID` value (same value in every example). For a static Pix QR code the parameter is `identifier=<qr identifier>` instead.
- Success response body, and what happens for an already-paid or expired charge: **UNVERIFIED**. I did not call it with credentials (no sign-up).
- Effect (per the docs): the charge is paid as a test Pix, your registered webhooks fire (`OPENPIX:CHARGE_COMPLETED`, `OPENPIX:TRANSACTION_RECEIVED`) and the transaction appears in the dashboard. In the official sandbox example the payer is the customer (`pix.infoPagador: "OpenPix testing"`).
- The spec's charge examples contain a `brCode` with `https://api.woovi.com/openpix/testing?transactionID=...` embedded, which suggests the testing flow is also reachable by scanning that test QR. UNVERIFIED.
- The amount paid always equals the charge value (no amount parameter documented). Simulating an underpayment or overpayment is **UNVERIFIED**.

### Other sandbox facilities

- **Dashboard "test account"**: pay a Pix key, QR or charge from the UI (https://developers.woovi.com/en/docs/test-environment/test-account/paying-a-pix-key-with-test-account). Special test Pix keys `pix-key-not-found@woovi.com` and `bank-error@woovi.com` simulate failures for Pix out.
- **Pix Automático in sandbox is UI-only** (https://developers.woovi.com/en/docs/test-environment/pix-automatic-in-sandbox): create the subscription (API or UI), then in the sandbox dashboard click **"simular assinatura"** (fires `PIX_AUTOMATIC_APPROVED` and generates all installments immediately), then click **"simular pagamento"** per installment (fires `PIX_AUTOMATIC_COBR_COMPLETED`). Rejecting a mandate, failed attempts and retries cannot be simulated per that page. I found **no API** for these simulations (neither the spec nor the docs list one), so end-to-end Pix Automático tests need manual clicks or must be mocked.
- **Pix out error simulation** (not relevant to charges): paying special account numbers via `POST /api/v1/payment` triggers `OPENPIX:MOVEMENT_FAILED` (https://developers.woovi.com/en/docs/flows/sandbox-error-simulation).
- Webhook ping on creation and dashboard "resend" are available.
- **Node SDK sandbox**: the SDK has no documented option to change the base URL. The docs tell you to edit the `API_BASE_URL` constant in the SDK source (https://developers.woovi.com/en/docs/sdk/node/how-to-configure-for-sandbox). Another reason to use plain `fetch`.

---

## 8. Error format

Woovi has no single error envelope. Observed shapes:

| Case | Status | Body | Source |
|---|---|---|---|
| Bad or unknown AppID | 401 | `{"data":null,"errors":[{"message":"appID inválido"}]}` | docs https://developers.woovi.com/en/docs/apis/getting-started-api and my live probe (prod and sandbox) |
| Bad AppID on the sandbox testing route | 401 | `{"data":null,"errors":[{"message":"Invalid appID"}]}` | my live probe (note the English text) |
| Business or validation error | 400 | `{ "error": "<message>" }` | spec: every operation's `400` response |
| Missing scope or feature | 403 | `{ "error": "<message>" }` | Anticipation API docs; the spec declares 403 broadly |
| Not found / conflict | 404 / 409 | `{ "error": "<message>" }` | Anticipation API docs (404 not found, 409 already exists, with `?return_existing=true` returning 200 instead) |
| KYC validation | 400/422 | `{ "error": [ { code, path, message } ] }` (Zod format) | spec `KycValidationError` |
| Unknown route (sandbox probe on prod host) | 404 | plain text `Not Found` | my live probe |

- Status codes appearing in the spec: 200 (charge create returns **200**, not 201), 201, 202, 204, 400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 502, 503.
- Error messages are free text (Portuguese and English mixed) and there is **no machine-readable error code** on core endpoints. Parse defensively: `body.error` (string) or `body.errors[0].message`.
- The exact error text and status for: duplicate charge `correlationID`, duplicate customer, value below minimum, invalid `taxID`, charge not found, charge already paid on delete: all **UNVERIFIED**.
- Pagination errors appear inside `pageInfo.errors[]` (`{ message, data: { skip, limit } }`).

---

## 9. Official Node SDK

- Package: **`@woovi/node-sdk`** (https://www.npmjs.com/package/@woovi/node-sdk), repo https://github.com/woovibr/woovi-nodejs-sdk. Docs: https://developers.woovi.com/en/docs/sdk/node/sdk-node-usage
- From the npm registry (queried 2026-10-19): latest **1.3.3**, published **2025-11-06**; registry "modified" 2025-12-08; license MIT; one runtime dependency `@woovi/apiwithlog ^2.6.2`; ESM and CJS builds with types. That is roughly **11 months since the last release**.
- GitHub (page view): 159 commits on `main`, 1 open issue, 1 open PR, 14 stars, not archived, README still says "OpenPix". The org `woovibr` itself is active (docs repo updated 2026-10-19), but this SDK moves slowly.
- Usage: `import { createClient } from '@woovi/node-sdk'; const woovi = createClient({ appId })`. Resources from `src/index.ts`: `account`, `accountRegister`, `application`, `cashback`, `charge`, `chargeRefund`, `customer`, `partner`, `payment`, `pixQrCode`, `refund`, `subAccount`, `subscription`, `transactions`, `transfer`, `webhook`. The shape of `ApiConfig` beyond `appId` is UNVERIFIED.
- **Gaps for a billing adapter**: no installments or CobR resource (so no Pix Automático installment/retry endpoints), no webhook public-keys helper (the docs mention `webhook.handler(...)`, whose verification details I did not verify), no `return_existing` documented, no sandbox switch short of editing source, and the docs inconsistently name the subscription resource `subscription` vs `subscriptions`.
- Other official SDKs: PHP (https://github.com/woovibr/php-sdk, MIT) and Java (docs page exists). Also n8n and Zapier integrations.
- **Recommendation: plain `fetch`.** The API surface needed is small (about 15 endpoints), the OpenAPI spec is published and can be used for generated types (https://api.woovi.com/api/openapi.json), and the SDK blocks sandbox use and lacks the subscription installment endpoints.

---

## 10. Gotchas for a provider-agnostic adapter

1. **Auth is the raw AppID** in `Authorization` (no `Bearer`). Sandbox and prod need separate accounts and AppIDs. AppIDs are created by hand in the dashboard.
2. **`correlationID` is the idempotency key and the main lookup key.** Charges, subscriptions and refunds can be fetched by it. Always send `return_existing=true` on charge create, and generate UUIDs.
3. **One webhook registration per event.** There are 52 events, and an adapter needs roughly 9 to 13 separate `POST /webhook` calls.
4. **No event ID or timestamp in webhook payloads and no ordering guarantee.** Build a dedupe key from `event` plus the object ID (`charge.correlationID`, `pix.endToEndId`, installment `globalID`, `refundTransaction.endToEndId`).
5. **Verify `x-webhook-signature` over the raw body** against a **1024-bit RSA key**. Fetch keys from the public endpoint and accept any listed key (rotation is supported). The legacy HMAC-SHA1 header is deprecated.
6. **Webhook test ping has no `charge` object.** Your handler must return 200 on it. Always return 2xx fast, because retries run about 42 minutes (8 attempts) and a 100-second timeout applies.
7. **Sandbox payment simulation is `GET api.woovi-sandbox.com/openpix/testing?transactionID=`**. The docs print the wrong (prod) host. Pix Automático cannot be simulated through any API (UI buttons only).
8. **Two mechanisms hide behind `/subscriptions`.** `PIX_RECURRING` (Pix Automático: mandate plus recurring CobR debits, with a rich event set) and `RECURRENT` (Woovi generates a charge or boleto each cycle that the customer pays manually, with no subscription-level events).
9. **No webhook on merchant cancellation** and no generic subscription events. Cancel via `PUT /subscriptions/{id}/cancel` and update local state yourself.
10. **Pix Automático constraints:** customer address required, `comment` under 30 characters, no `BIMONTHLY`, journey 2 needs a start date at least 3 days out, journey 3 needs `dayGenerateCharge` = today, CobR is created 4 days before the charge date, and the payer can revoke at any time.
11. **Refund correlation gap:** refund webhooks do not carry the refund `correlationID` you sent. Match on `endToEndId`. Two refund APIs exist with different status vocabularies.
12. **Docs vs spec drift:** `pixRecurring` vs `pixRecurringOptions`, `dayGenerateCharge` range (0..27 vs 1..31/date), `type` required or not, `expiresIn` string vs number, webhook path `/api/openpix/v1/webhook` vs `/api/v1/webhook`, status strings (`CANCEL`/`CANCELED`, `COMPLETED`/`CONCLUDED`). Treat statuses as open strings and key off event names.
13. **Money:** integer cents everywhere. `taxID` is a string in requests but an object `{taxID, type}` in responses and webhooks. Phone formats are inconsistent.
14. **Rate limit 10 req/s.** The 429 behavior is undocumented for core endpoints, so add client-side throttling.
15. **Pagination:** list responses carry `pageInfo`, but `skip`/`limit` are not declared on `GET /charge`. Prefer lookup by `correlationID` over listing.
16. **Charge lifecycle is thin:** `ACTIVE`, `COMPLETED`, `EXPIRED` only. Expiry minimum is 5 minutes. The value is immutable (only `expiresDate` can be patched). There is no "canceled" status, so a delete means the charge disappears (UNVERIFIED how it reads back).
17. **Paid versus settled:** the docs warn a paid webhook means the charge is settled, not that money is available (https://developers.woovi.com/en/docs/subscription-recurrence/subscription-with-boleto-create-api). Fees are reported in cents on `charge.fee` and `pix.fee`.

## 11. Unverified checklist (needs credentials or direct confirmation)

- Duplicate-`correlationID` behavior on charge create without `return_existing` (status and message), and whether `return_existing` checks the payload.
- Default `expiresIn` for charges, and what `DELETE /charge/{id}` leaves behind (status, 404 on GET).
- Over/under-payment of a charge, and a refund time limit.
- Success body and edge cases of `GET /openpix/testing`.
- Behavior when the 10 req/s limit is exceeded (status, headers).
- Whether `OPENPIX:CHARGE_COMPLETED` also fires for `CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER`.
- Whether `OPENPIX:CHARGE_*` events fire for plain-Pix `RECURRENT` subscription charges, and their `charge.subscription` payload.
- Request body of `PUT /subscriptions/{id}/value`, and the response body of `PUT /subscriptions/{id}/cancel`.
- Whether the `correlationID` in COBR webhooks is the installment's or the subscription's.
- Whether a Pix Automático mandate revocation after approval emits `PIX_AUTOMATIC_REJECTED`.
- Customer deduplication on `POST /customer` and on a customer embedded in a charge.
- Default page size and maximum `limit` for list endpoints.
- Whether an API exists to set the HMAC webhook secret.
- Whether Pix Automático needs a feature flag or account approval.
