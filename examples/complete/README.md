# Agendaí, complete

The same booking app as [`../minimal`](../minimal), with what you (or your coding agent) can build on top of the default:

- `src/routes/assinar.$planId.tsx`: checkout where the customer picks how to pay. Only the methods your providers turned on show up, and TypeScript rejects the rest. Pix shows the QR code in the page and waits for the payment; card and Pix Automático go to the provider's page.
- `src/routes/assinatura.tsx`: current plan, usage, payment method, cancel and keep. Confirms the payment when the customer comes back from the provider.
- `src/routes/relatorios.tsx`: a page only Pro unlocks, using `billing.check`.
- `src/billing/dunas.ts`: Woovi and AbacatePay taking turns (`routing: "round-robin"`), card turned on for AbacatePay, and `on` handlers for subscription events.

```sh
# WOOVI_APP_ID, or ABACATEPAY_API_KEY + ABACATEPAY_WEBHOOK_SECRET, in ../../.env.local
pnpm dev   # http://localhost:3102
```

No webhook reaches localhost, so in dev a yellow bar checks the pending charge with the provider every few seconds and offers "Simular pagamento" for Pix QR codes. On AbacatePay's pages (card, hosted Pix), use their own simulation button. The bar lives in `src/sandbox`, outside the example.
