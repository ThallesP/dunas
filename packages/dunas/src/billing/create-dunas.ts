import type { Grant } from "../catalog/feature.ts"
import {
  type BooleanFeatureIdOf,
  type MeteredFeatureIdOf,
  type Plan,
  validatePlans,
} from "../catalog/plan.ts"
import type { Database } from "../database/database.ts"
import { migrate } from "../database/migrations.ts"
import type { NextFor } from "../entities/charge.ts"
import { handleRequest, type Identify } from "../http/handler.ts"
import type { Checkout, CheckoutOf, MethodOf, PaymentProvider } from "../providers/provider.ts"
import { getCharge, simulatePayment, syncCharge } from "./charges.ts"
import type { Context, Routing } from "./context.ts"
import { getOrCreateCustomer, type UpsertCustomerInput, upsertCustomer } from "./customers.ts"
import {
  type Balance,
  check,
  consume,
  getEntitlements,
  isMeteredGrant,
  track,
} from "./entitlements.ts"
import { addListener, type DunasEvents, type EventHandler, type EventHandlers } from "./events.ts"
import { listPlans } from "./plan-options.ts"
import { runRenewals } from "./renewals.ts"
import {
  cancel,
  listSubscriptions,
  type SubscribeInput,
  type SubscribeResult,
  subscribe,
} from "./subscriptions.ts"

export type DunasOptions<
  TPlans extends readonly Plan[],
  TProviders extends readonly PaymentProvider[],
> = {
  database: Database
  plans: TPlans
  providers: TProviders
  routing?: Routing<TProviders[number]["id"]>
  identify?: Identify
  on?: EventHandlers
  basePath?: string
  cronSecret?: string
  chargeExpiresInSeconds?: number
  renewDaysBefore?: number
  graceDays?: number
  now?: () => Date
}

export function createDunas<
  const TPlans extends readonly Plan[],
  const TProviders extends readonly [PaymentProvider, ...PaymentProvider[]],
>({
  database,
  plans,
  providers,
  routing = "failover",
  identify,
  on = {},
  basePath = "/api/dunas",
  cronSecret = globalThis.process?.env.CRON_SECRET,
  chargeExpiresInSeconds = 86_400,
  renewDaysBefore = 3,
  graceDays = 3,
  now = () => new Date(),
}: DunasOptions<TPlans, TProviders>) {
  type PlanId = TPlans[number]["id"]
  type MeteredFeatureId = MeteredFeatureIdOf<TPlans>
  type BooleanFeatureId = BooleanFeatureIdOf<TPlans>
  type Method = MethodOf<TProviders>
  type DefaultMethod = "pix_automatico" extends Method ? "pix_automatico" : "pix"
  type UsageInput = {
    customerId: string
    featureId: MeteredFeatureId
    amount?: number
    idempotencyKey?: string
  }

  validatePlans(plans)

  const context: Context = {
    database,
    plans,
    providers,
    routing,
    on,
    listeners: {},
    now,
    chargeExpiresInSeconds,
    renewDaysBefore,
    graceDays,
    roundRobinCounter: { value: 0 },
  }

  const grants: TPlans[number]["includes"][number][] = plans.flatMap(({ includes }) => includes)
  const meteredIds = unique(
    grants.filter(isMeteredGrant).map((grant): MeteredFeatureId => grant.featureId),
  )
  const booleanIds = unique(
    grants.filter(isBooleanGrant).map((grant): BooleanFeatureId => grant.featureId),
  )

  async function getCustomer({ customerId }: { customerId: string }) {
    const customer = await getOrCreateCustomer(context, customerId)
    const subscriptions = await listSubscriptions(context, customerId)
    const { balances, flags } = await getEntitlements(context, customer, subscriptions, {
      meteredIds,
      booleanIds,
    })
    return { ...customer, subscriptions, balances, flags }
  }

  function subscribeTo<
    TMethod extends Method = DefaultMethod,
    TCheckout extends Checkout = "hosted",
  >(input: {
    customerId: string
    planId: PlanId
    method?: TMethod
    checkout?: TCheckout & CheckoutOf<TProviders, TMethod>
    successUrl?: string
  }): Promise<SubscribeResult<NextFor<TCheckout>>>
  function subscribeTo(input: SubscribeInput) {
    return subscribe(context, input)
  }

  function checkFeature(input: {
    customerId: string
    featureId: MeteredFeatureId
    required?: number
  }): Promise<{ allowed: boolean; balance: Balance }>
  function checkFeature(input: {
    customerId: string
    featureId: BooleanFeatureId
  }): Promise<{ allowed: boolean }>
  function checkFeature(input: { customerId: string; featureId: string; required?: number }) {
    return check(context, input)
  }

  const billing = {
    migrate: () => migrate(database),
    upsertCustomer: (input: UpsertCustomerInput) => upsertCustomer(context, input),
    getCustomer,
    listPlans: ({ customerId }: { customerId: string }) =>
      listPlans<TPlans[number]>(context, plans, customerId),
    subscribe: subscribeTo,
    cancel: (input: { customerId: string; planId: PlanId; immediately?: boolean }) =>
      cancel(context, input),
    check: checkFeature,
    track: (input: UsageInput) => track(context, input),
    consume: (input: UsageInput) => consume(context, input),
    getCharge: ({ chargeId }: { chargeId: string }) => getCharge(context, chargeId),
    syncCharge: ({ chargeId }: { chargeId: string }) => syncCharge(context, chargeId),
    simulatePayment: ({ chargeId }: { chargeId: string }) => simulatePayment(context, chargeId),
    runRenewals: () => runRenewals(context),
    registerWebhooks: async ({ baseUrl }: { baseUrl: string }) => {
      const registered: { provider: string; url: string }[] = []
      for (const provider of providers) {
        const url = `${baseUrl.replace(/\/$/, "")}${basePath}/webhooks/${provider.id}`
        await provider.registerWebhook({ url })
        registered.push({ provider: provider.id, url })
      }
      return registered
    },
    on: <TEvent extends keyof DunasEvents>(type: TEvent, handler: EventHandler<TEvent>) =>
      addListener(context.listeners, type, handler),
    basePath,
    identify,
    handler: (request: Request) =>
      handleRequest(request, {
        context,
        basePath,
        identify,
        cronSecret,
        getCustomer,
        listPlans: (customerId: string) => listPlans(context, plans, customerId),
      }),
  }

  return billing
}

export type Dunas = ReturnType<typeof createDunas>

function isBooleanGrant<TGrant extends Grant>(
  grant: TGrant,
): grant is Extract<TGrant, { type: "boolean" }> {
  return grant.type === "boolean"
}

function unique<TValue>(values: TValue[]) {
  return [...new Set(values)]
}
