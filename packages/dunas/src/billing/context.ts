import type { Plan } from "../catalog/plan.ts"
import type { Database } from "../database/database.ts"
import type { PaymentMethod, PaymentProvider } from "../providers/provider.ts"
import type { EventHandlers, EventListeners } from "./events.ts"

export type RoutingInput = {
  customerId: string
  amountInCents: number
  method: PaymentMethod
}

export type Routing<TProviderId extends string> =
  | "failover"
  | "round-robin"
  | { weights: Partial<Record<TProviderId, number>> }
  | ((input: RoutingInput) => TProviderId | readonly TProviderId[])

export type Context = {
  database: Database
  plans: readonly Plan[]
  providers: readonly [PaymentProvider, ...PaymentProvider[]]
  routing: Routing<string>
  on: EventHandlers
  listeners: EventListeners
  now: () => Date
  chargeExpiresInSeconds: number
  renewDaysBefore: number
  graceDays: number
  roundRobinCounter: { value: number }
}
