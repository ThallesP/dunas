# Verified against the sandboxes (2026-10-19)

What the docs said versus what the Woovi sandbox and AbacatePay dev mode actually did. Tests: `packages/dunas/test/e2e`, plus webhooks delivered through a trycloudflare tunnel to `examples/hono`.

## Woovi sandbox

- `POST /api/v1/charge?return_existing=true` with our id as `correlationID` works, and `GET /api/v1/charge/{correlationID}` reads it back.
- `GET /openpix/testing?transactionID=` on `api.woovi-sandbox.com` pays the charge. It answers `302` to `openpix.com.br` but the payment goes through; follow the redirect or ignore it.
- Paid charges come back `COMPLETED` with `paidAt`.
- Registering a webhook pings the URL and fails with "Seu endpoint de webhook precisa retornar o código de status 200" unless the endpoint is already up and answers 200. Register after the server listens.
- Real `OPENPIX:CHARGE_COMPLETED` deliveries carry `x-webhook-signature` (RSA-SHA256, verified with the key from `/api/v1/webhook/public-keys`), plus the legacy `x-openpix-signature` and an empty `x-openpix-authorization`.
- Woovi reuses the customer by taxID: a charge for a known CPF shows that customer's earlier email.

## AbacatePay dev mode (v2)

- `POST /v2/transparents/create` with `method: "PIX"` and `POST /v2/transparents/simulate-payment?id=` work as documented.
- `GET /v2/transparents/get` is cached: after a simulated payment it flapped `PAID → PENDING → PENDING → PAID` across four reads 5 seconds apart. `GET /v2/transparents/check` was consistent. dunas reads status with `check`.
- Real `transparent.completed` deliveries use the legacy envelope (`id: "log_..."`, `event`, `data.transparent.id`), carry `x-webhook-signature` that matches HMAC-SHA256 with the public key published in the docs, and send the secret in an `x-webhook-secret` header.
- `POST /v2/webhooks/create` registers without pinging the URL. `POST /v2/webhooks/delete?id=` removes it.

## Payment methods and hosted checkouts (2026-10-31)

Woovi sandbox:

- `POST /api/v1/subscriptions` with `type: "PIX_RECURRING"` and `journey: "PAYMENT_ON_APPROVAL"` works without a customer address, despite the docs saying it is required. The customer is reused by taxID, as with charges.
- The response has `globalID`, `pixRecurring.{recurrencyId, emv, paymentLinkID}` and `paymentLink`, but no `pixRecurring.status` and no `paymentLinkUrl`. In the sandbox `emv` and `paymentLinkID` are placeholders (`sandbox-pix-automatic-emv/...`), and `https://woovi-sandbox.com/pay/<paymentLinkID>` shows "Link de Pagamento não encontrado". The production hosted URL is still unverified; dunas builds it as `https://woovi.com/pay/<paymentLinkID>` when `paymentLinkUrl` is missing.
- `GET /api/v1/subscriptions/{id}` only accepts the `globalID`. The `correlationID` answers `400 invalid subscription id`.
- `PUT /api/v1/subscriptions/{globalID}/cancel` works.
- Regular charges return a working `paymentLinkUrl` (`https://woovi-sandbox.com/pay/<uuid>`), which is what `checkout: "hosted"` uses.
- Still unverified: whether `PIX_AUTOMATIC_APPROVED` with `PAYMENT_ON_APPROVAL` always means the first installment was paid. dunas treats it as the first payment and dedupes it with installment 1 of `PIX_AUTOMATIC_COBR_COMPLETED`.

AbacatePay dev mode:

- `POST /v2/products/create` with an existing `externalId` answers `400 Product with externalId already exists`. `GET /v2/products/get?externalId=` works. `items[].id` in checkouts accepts the product's `externalId`.
- `POST /v2/checkouts/create` with `methods: ["PIX"]` returns a hosted page (`https://app.abacatepay.com/pay/bill_...`), and the same `externalId` returns the same checkout.
- `POST /v2/subscriptions/create` with `methods: ["CARD"]` returns a hosted subscription checkout in dev mode. With `methods: ["PIX"]` it answers `400 PIX Automático is not available for this store`.
- `GET /v2/subscriptions/get?externalId=` finds nothing before the first payment. `GET /v2/subscriptions/checkouts/get?externalId=` finds the checkout.
