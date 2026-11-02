import type { Grant } from "./feature.ts"

export type BillingInterval = "week" | "month" | "year"

export type PlanPrice = {
  amountInCents: number
  interval: BillingInterval
}

export type Plan<TId extends string = string, TGrant extends Grant = Grant> = {
  id: TId
  name: string
  group: string
  isDefault: boolean
  price: PlanPrice | null
  includes: readonly TGrant[]
}

export type PlanConfig<TId extends string, TGrant extends Grant> = {
  id: TId
  name?: string
  group?: string
  default?: boolean
  price?: PlanPrice
  includes?: readonly TGrant[]
}

export type MeteredFeatureIdOf<TPlans extends readonly Plan[]> = Extract<
  TPlans[number]["includes"][number],
  { type: "metered" }
>["featureId"]

export type BooleanFeatureIdOf<TPlans extends readonly Plan[]> = Extract<
  TPlans[number]["includes"][number],
  { type: "boolean" }
>["featureId"]

const planIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/

export function plan<const TId extends string, const TGrant extends Grant = never>({
  id,
  name = titleFromId(id),
  group = "base",
  default: isDefault = false,
  price,
  includes = [],
}: PlanConfig<TId, TGrant>): Plan<TId, TGrant> {
  if (!planIdPattern.test(id)) {
    throw new Error(`Invalid plan id "${id}": use lowercase letters, digits, "-" or "_"`)
  }

  if (price && (!Number.isInteger(price.amountInCents) || price.amountInCents < 100)) {
    throw new Error(
      `Invalid plan "${id}": price.amountInCents must be an integer of at least 100 (R$ 1,00)`,
    )
  }

  if (isDefault && price) {
    throw new Error(`Invalid plan "${id}": a default plan must be free`)
  }

  const featureIds = includes.map((grant) => grant.featureId)
  const duplicate = featureIds.find((featureId, index) => featureIds.indexOf(featureId) !== index)
  if (duplicate) {
    throw new Error(`Invalid plan "${id}": feature "${duplicate}" is included twice`)
  }

  return Object.freeze({
    id,
    name,
    group,
    isDefault,
    price: price ? Object.freeze({ ...price }) : null,
    includes: Object.freeze([...includes]),
  })
}

export function validatePlans(plans: readonly Plan[]) {
  const ids = new Set<string>()
  const defaultGroups = new Set<string>()
  const featureTypes = new Map<string, Grant["type"]>()

  for (const { id, group, isDefault, includes } of plans) {
    if (ids.has(id)) {
      throw new Error(`Plan "${id}" is declared twice`)
    }
    ids.add(id)

    if (isDefault && defaultGroups.has(group)) {
      throw new Error(`Group "${group}" has more than one default plan`)
    }
    if (isDefault) {
      defaultGroups.add(group)
    }

    for (const { featureId, type } of includes) {
      const knownType = featureTypes.get(featureId)
      if (knownType && knownType !== type) {
        throw new Error(`Feature "${featureId}" is boolean in one plan and metered in another`)
      }
      featureTypes.set(featureId, type)
    }
  }
}

function titleFromId(id: string) {
  return id
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
