import { PGlite } from "@electric-sql/pglite"
import { abacatepay, createDunas, pglite } from "dunasjs"
import { free, pro } from "./plans.ts"

export const billing = createDunas({
  database: pglite(new PGlite("./.pglite")),
  plans: [free, pro],
  providers: [
    abacatepay({
      apiKey: process.env.ABACATEPAY_API_KEY,
      webhookSecret: process.env.ABACATEPAY_WEBHOOK_SECRET,
    }),
  ],
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
