import type { Subscription } from "../entities/subscription.ts"
import type { Context } from "./context.ts"
import { findProvider } from "./routing.ts"

export async function detachProviderSubscription(context: Context, subscription: Subscription) {
  const { provider: providerId, providerSubscriptionId } = subscription
  if (!providerId || !providerSubscriptionId) {
    return
  }

  await findProvider(context.providers, providerId).cancelSubscription?.(providerSubscriptionId)
  await context.database.query(
    "UPDATE dunas_subscription SET provider_subscription_id = NULL, updated_at = now() WHERE id = $1",
    [subscription.id],
  )
}

export async function detachInBackground(context: Context, subscriptions: Subscription[]) {
  for (const subscription of subscriptions) {
    await detachProviderSubscription(context, subscription).catch((error: unknown) => {
      console.error(`[dunas] could not cancel the provider side of ${subscription.id}`, error)
    })
  }
}
