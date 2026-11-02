import { PGlite } from "@electric-sql/pglite"
import { createDunasClient } from "../src/client/client.ts"
import { abacatepay, createDunas, pglite, plan, woovi } from "../src/index.ts"

const pro = plan({ id: "pro", price: { amountInCents: 500, interval: "month" } })

export async function subscribeTypes() {
  const both = createDunas({
    database: pglite(new PGlite()),
    plans: [pro],
    providers: [
      woovi({ appId: "x", methods: ["pix_automatico"] }),
      abacatepay({ apiKey: "x", webhookSecret: "x".repeat(32), methods: ["card"] }),
    ],
  })

  const easiest = await both.subscribe({ customerId: "u", planId: "pro" })
  const easiestType: "redirect" | "none" = easiest.next.type

  const embeddedAuto = await both.subscribe({
    customerId: "u",
    planId: "pro",
    method: "pix_automatico",
    checkout: "embedded",
  })
  const embeddedAutoType: "pix" | "none" = embeddedAuto.next.type

  const embeddedPix = await both.subscribe({
    customerId: "u",
    planId: "pro",
    method: "pix",
    checkout: "embedded",
  })
  const embeddedPixType: "pix" | "none" = embeddedPix.next.type

  const card = await both.subscribe({ customerId: "u", planId: "pro", method: "card" })
  const cardType: "redirect" | "none" = card.next.type

  // @ts-expect-error card is hosted only
  await both.subscribe({ customerId: "u", planId: "pro", method: "card", checkout: "embedded" })

  const pixOnly = createDunas({
    database: pglite(new PGlite()),
    plans: [pro],
    providers: [abacatepay({ apiKey: "x", webhookSecret: "x".repeat(32) })],
  })
  // @ts-expect-error no provider enables pix_automatico
  await pixOnly.subscribe({ customerId: "u", planId: "pro", method: "pix_automatico" })
  // @ts-expect-error no provider enables card
  await pixOnly.subscribe({ customerId: "u", planId: "pro", method: "card" })
  // @ts-expect-error unknown plan
  await pixOnly.subscribe({ customerId: "u", planId: "pr0" })

  // @ts-expect-error woovi has no card
  woovi({ appId: "x", methods: ["card"] })

  return [easiestType, embeddedAutoType, embeddedPixType, cardType]
}

export async function clientTypes() {
  const billing = createDunas({
    database: pglite(new PGlite()),
    plans: [pro],
    providers: [woovi({ appId: "x", methods: ["pix_automatico"] })],
  })
  const client = createDunasClient<typeof billing>()

  const { next } = await client.subscribe({ planId: "pro", checkout: "embedded" })
  // @ts-expect-error no provider enables card
  await client.subscribe({ planId: "pro", method: "card" })

  return next.type === "pix" ? next.expiresAt.toUpperCase() : next.type
}
