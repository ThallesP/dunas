import { abacatepay, createDunas, pglite, woovi } from "dunas"
import { database } from "../lib/database.ts"
import { userFromRequest } from "../lib/session.ts"
import { free, pro } from "./plans.ts"

export const billing = createDunas({
  database: pglite(database),
  plans: [free, pro],
  providers: [
    woovi({ appId: process.env.WOOVI_APP_ID, sandbox: true }),
    abacatepay({
      apiKey: process.env.ABACATEPAY_API_KEY,
      webhookSecret: process.env.ABACATEPAY_WEBHOOK_SECRET,
      methods: ["card"],
    }),
  ],
  routing: "round-robin",
  identify: userFromRequest,
  on: {
    "subscription.activated": ({ subscription }) =>
      console.info(`[agendaí] ${subscription.customerId} assinou o ${subscription.planId}`),
    "subscription.canceled": ({ subscription }) =>
      console.info(`[agendaí] ${subscription.customerId} saiu do ${subscription.planId}`),
    "subscription.method_changed": ({ subscription }) =>
      console.info(`[agendaí] ${subscription.customerId} agora paga com ${subscription.method}`),
  },
})

export type Method = NonNullable<Parameters<typeof billing.subscribe>[0]["method"]>

export const paymentMethods: Method[] = ["card", "pix"]

await billing.migrate()
