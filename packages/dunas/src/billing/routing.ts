import type { Checkout, PaymentMethod, PaymentProvider } from "../providers/provider.ts"
import type { Context, RoutingInput } from "./context.ts"
import { DunasError } from "./errors.ts"

export function orderProviders(context: Context, input: RoutingInput & { checkout: Checkout }) {
  const supporting = routeProviders(context, input).filter((provider) => supports(provider, input))
  if (supporting.length === 0) {
    throw new DunasError(
      "METHOD_NOT_AVAILABLE",
      `No provider offers ${input.method} with a ${input.checkout} checkout`,
    )
  }
  return supporting
}

export function supports(
  provider: PaymentProvider,
  { method, checkout }: { method: PaymentMethod; checkout: Checkout },
) {
  return (
    provider.methods.includes(method) && Boolean(provider.checkouts[method]?.includes(checkout))
  )
}

export function findProvider(providers: readonly PaymentProvider[], providerId: string) {
  const provider = providers.find(({ id }) => id === providerId)
  if (!provider) {
    throw new DunasError("PROVIDER_NOT_FOUND", `Provider "${providerId}" is not configured`)
  }
  return provider
}

function routeProviders({ providers, routing, roundRobinCounter }: Context, input: RoutingInput) {
  if (routing === "failover") {
    return providers
  }

  if (routing === "round-robin") {
    const start = roundRobinCounter.value % providers.length
    roundRobinCounter.value += 1
    return [...providers.slice(start), ...providers.slice(0, start)]
  }

  if (typeof routing === "function") {
    const chosen = [routing(input)].flat()
    return chosen.map((providerId) => findProvider(providers, providerId))
  }

  const first = pickWeighted(providers, routing.weights)
  return [first, ...providers.filter((provider) => provider !== first)]
}

function pickWeighted(
  providers: readonly [PaymentProvider, ...PaymentProvider[]],
  weights: Partial<Record<string, number>>,
) {
  const total = providers.reduce((sum, { id }) => sum + (weights[id] ?? 0), 0)
  let target = Math.random() * total

  for (const provider of providers) {
    target -= weights[provider.id] ?? 0
    if (target < 0) {
      return provider
    }
  }

  return providers[0]
}
