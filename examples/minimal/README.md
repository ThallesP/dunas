# Agendaí, minimal

A booking app for barbershops, billed with dunas on the default path. Two plans, and "Assinar o Pro" sends the customer to the provider's payment page.

The files that touch billing:

- `src/billing/plans.ts`: the Grátis and Pro plans
- `src/billing/dunas.ts`: `createDunas` with Woovi and/or AbacatePay, taking turns (`routing: "round-robin"`)
- `src/billing/functions.ts`: server functions for usage, plans and `subscribe`
- `src/bookings/functions.ts`: `consume` before each new booking
- `src/routes/api/dunas/$.ts`: the dunas handler, for webhooks and the renewal cron

```sh
# WOOVI_APP_ID, or ABACATEPAY_API_KEY + ABACATEPAY_WEBHOOK_SECRET, in ../../.env.local
pnpm dev   # http://localhost:3101
```

No webhook reaches localhost, so in dev a yellow bar checks the pending charge with the provider every few seconds and offers "Simular pagamento" for Woovi. On AbacatePay's page, use its own "Simular Pagamento" button. The bar lives in `src/sandbox`, outside the example.

The complete version, with payment method choice, Pix QR code in the page and a billing page, is in [`../complete`](../complete).
