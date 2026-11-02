import type { Charge } from "../entities/charge.ts"
import type { Subscription } from "../entities/subscription.ts"
import type { PaymentMethod } from "../providers/provider.ts"

export type DunasEvents = {
  "charge.created": { charge: Charge }
  "charge.paid": { charge: Charge }
  "charge.expired": { charge: Charge }
  "subscription.activated": { subscription: Subscription }
  "subscription.renewed": { subscription: Subscription }
  "subscription.past_due": { subscription: Subscription }
  "subscription.canceled": { subscription: Subscription }
  "subscription.method_changed": { subscription: Subscription; previousMethod: PaymentMethod }
}

export type EventHandler<TEvent extends keyof DunasEvents> = (
  payload: DunasEvents[TEvent],
) => unknown

export type EventHandlers = {
  [TEvent in keyof DunasEvents]?: EventHandler<TEvent>
}

export type EventListeners = {
  [TEvent in keyof DunasEvents]?: EventHandler<TEvent>[]
}

export type PendingEvent = () => Promise<void>

export function event<TEvent extends keyof DunasEvents>(
  { on, listeners }: { on: EventHandlers; listeners: EventListeners },
  type: TEvent,
  payload: DunasEvents[TEvent],
): PendingEvent {
  return async () => {
    for (const handler of [on[type], ...(listeners[type] ?? [])]) {
      try {
        await handler?.(payload)
      } catch (error) {
        console.error("[dunas] event handler failed", error)
      }
    }
  }
}

export function addListener<TEvent extends keyof DunasEvents>(
  listeners: { [TListenedEvent in TEvent]?: EventHandler<TListenedEvent>[] },
  type: TEvent,
  handler: EventHandler<TEvent>,
) {
  listeners[type] = [...(listeners[type] ?? []), handler]
  return () => {
    listeners[type] = listeners[type]?.filter((listener) => listener !== handler)
  }
}

export async function emit(events: PendingEvent[]) {
  for (const run of events) {
    await run()
  }
}
