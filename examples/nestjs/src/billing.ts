import { PGlite } from "@electric-sql/pglite"
import { abacatepay, createDunas, type PaymentProvider, pglite, woovi } from "dunas"
import { free, pro } from "./plans.ts"

const { WOOVI_APP_ID, ABACATEPAY_API_KEY, ABACATEPAY_WEBHOOK_SECRET } = process.env

const providers = [
  WOOVI_APP_ID ? woovi({ appId: WOOVI_APP_ID, sandbox: true }) : null,
  ABACATEPAY_API_KEY && ABACATEPAY_WEBHOOK_SECRET
    ? abacatepay({ apiKey: ABACATEPAY_API_KEY, webhookSecret: ABACATEPAY_WEBHOOK_SECRET })
    : null,
].filter((provider) => provider !== null)

const [firstProvider, ...otherProviders] = providers
if (!firstProvider) {
  throw new Error(
    "Set WOOVI_APP_ID or ABACATEPAY_API_KEY + ABACATEPAY_WEBHOOK_SECRET in .env.local",
  )
}

export const billing = createDunas({
  database: pglite(new PGlite("./.pglite")),
  plans: [free, pro],
  providers: [firstProvider, ...otherProviders] satisfies [PaymentProvider, ...PaymentProvider[]],
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
