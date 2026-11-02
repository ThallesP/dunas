import { PGlite } from "@electric-sql/pglite"
import { abacatepay, createDunas, pglite, woovi } from "dunas"
import { free, pro } from "./plans.ts"

export const billing = createDunas({
  database: pglite(new PGlite("./.pglite")),
  plans: [free, pro],
  providers: [
    woovi({ appId: process.env.WOOVI_APP_ID, sandbox: true }),
    abacatepay({
      apiKey: process.env.ABACATEPAY_API_KEY,
      webhookSecret: process.env.ABACATEPAY_WEBHOOK_SECRET,
    }),
  ],
  routing: "round-robin",
  identify: (request) => {
    const userId = request.headers.get("cookie")?.match(/user=([\w-]+)/)?.[1]
    return userId
      ? { id: userId, name: "Cliente Demo", email: "demo@example.com", taxId: "52998224725" }
      : null
  },
  on: {
    "subscription.activated": ({ subscription }) => console.log("activated", subscription.planId),
  },
})
