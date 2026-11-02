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
    }),
  ],
  routing: "round-robin",
  identify: userFromRequest,
})

await billing.migrate()
