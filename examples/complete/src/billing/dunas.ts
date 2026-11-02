import {
  abacatepay,
  createDunas,
  type PaymentMethod,
  type PaymentProvider,
  pglite,
  woovi,
} from "dunas"
import { database } from "../lib/database.ts"
import { userFromRequest } from "../lib/session.ts"
import { free, pro } from "./plans.ts"

const { WOOVI_APP_ID, ABACATEPAY_API_KEY, ABACATEPAY_WEBHOOK_SECRET } = process.env

const providers = [
  WOOVI_APP_ID ? woovi({ appId: WOOVI_APP_ID, sandbox: true }) : null,
  ABACATEPAY_API_KEY && ABACATEPAY_WEBHOOK_SECRET
    ? abacatepay({
        apiKey: ABACATEPAY_API_KEY,
        webhookSecret: ABACATEPAY_WEBHOOK_SECRET,
        methods: ["card"],
      })
    : null,
].filter((provider) => provider !== null)

const [firstProvider, ...otherProviders] = providers
if (!firstProvider) {
  throw new Error("Set WOOVI_APP_ID or ABACATEPAY_API_KEY + ABACATEPAY_WEBHOOK_SECRET in .env")
}

export const billing = createDunas({
  database: pglite(database),
  plans: [free, pro],
  providers: [firstProvider, ...otherProviders] satisfies [PaymentProvider, ...PaymentProvider[]],
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

const methodOrder: PaymentMethod[] = ["pix_automatico", "card", "pix"]

const enabledProviders: readonly PaymentProvider[] = providers

export const paymentMethods = methodOrder.filter((method): method is Method =>
  enabledProviders.some(({ methods }) => methods.includes(method)),
)

await billing.migrate()
