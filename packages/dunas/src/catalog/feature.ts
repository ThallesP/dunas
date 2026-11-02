export type ResetInterval = "day" | "week" | "month" | "year" | "never"

export type FeatureType = "boolean" | "metered"

export type BooleanGrant<TId extends string = string> = {
  featureId: TId
  type: "boolean"
}

export type MeteredGrant<TId extends string = string> = {
  featureId: TId
  type: "metered"
  limit: number | "unlimited"
  reset: ResetInterval
}

export type Grant<TId extends string = string> = BooleanGrant<TId> | MeteredGrant<TId>

export type MeteredGrantConfig = {
  limit: number | "unlimited"
  reset?: ResetInterval
}

export type BooleanFeature<TId extends string> = (() => BooleanGrant<TId>) & {
  id: TId
  type: "boolean"
}

export type MeteredFeature<TId extends string> = ((
  config: MeteredGrantConfig,
) => MeteredGrant<TId>) & {
  id: TId
  type: "metered"
}

const featureIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/

export function feature<const TId extends string>(config: {
  id: TId
  type: "boolean"
}): BooleanFeature<TId>
export function feature<const TId extends string>(config: {
  id: TId
  type: "metered"
}): MeteredFeature<TId>
export function feature<const TId extends string>({ id, type }: { id: TId; type: FeatureType }) {
  if (!featureIdPattern.test(id)) {
    throw new Error(`Invalid feature id "${id}": use lowercase letters, digits, "-" or "_"`)
  }

  if (type === "boolean") {
    return Object.assign(() => Object.freeze({ featureId: id, type }), { id, type })
  }

  return Object.assign(
    ({ limit, reset = "month" }: MeteredGrantConfig) => {
      if (limit !== "unlimited" && (!Number.isInteger(limit) || limit < 0)) {
        throw new Error(
          `Invalid limit for feature "${id}": must be a non-negative integer or "unlimited"`,
        )
      }
      return Object.freeze({ featureId: id, type, limit, reset })
    },
    { id, type },
  )
}
