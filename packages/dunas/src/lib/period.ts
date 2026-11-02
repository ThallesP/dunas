import type { ResetInterval } from "../catalog/feature.ts"
import type { BillingInterval } from "../catalog/plan.ts"

export function addInterval(date: Date, interval: BillingInterval | ResetInterval, count = 1) {
  const next = new Date(date)

  if (interval === "day") {
    next.setUTCDate(next.getUTCDate() + count)
    return next
  }

  if (interval === "week") {
    next.setUTCDate(next.getUTCDate() + 7 * count)
    return next
  }

  if (interval === "never") {
    return new Date(8_640_000_000_000_000)
  }

  const monthsToAdd = interval === "year" ? 12 * count : count
  const day = next.getUTCDate()
  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + monthsToAdd)
  const lastDayOfMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate()
  next.setUTCDate(Math.min(day, lastDayOfMonth))
  return next
}

export function currentWindow(anchor: Date, interval: ResetInterval, now: Date) {
  if (interval === "never" || now < anchor) {
    return { start: anchor, end: addInterval(anchor, interval) }
  }

  const approximateLengthInMs = addInterval(anchor, interval).getTime() - anchor.getTime()
  let count = Math.floor((now.getTime() - anchor.getTime()) / approximateLengthInMs)

  while (addInterval(anchor, interval, count) > now) {
    count -= 1
  }
  while (addInterval(anchor, interval, count + 1) <= now) {
    count += 1
  }

  return {
    start: addInterval(anchor, interval, count),
    end: addInterval(anchor, interval, count + 1),
  }
}
