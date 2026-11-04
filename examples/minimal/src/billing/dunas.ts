import { abacatepay, createDunas, pglite } from "dunasjs"
import { database } from "../lib/database.ts"
import { userFromRequest } from "../lib/session.ts"
import { free, pro } from "./plans.ts"

export const billing = createDunas({
  database: pglite(database),
  plans: [free, pro],
  providers: [
    abacatepay({
      apiKey: process.env.ABACATEPAY_API_KEY,
      webhookSecret: process.env.ABACATEPAY_WEBHOOK_SECRET,
    }),
  ],
  identify: userFromRequest,
})

await billing.migrate()
