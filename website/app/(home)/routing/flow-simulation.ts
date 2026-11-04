import { type ProviderSlot, type RoutingMode, routingModes } from "./routing-modes"

export type FlowTarget = "dunas" | ProviderSlot

export type FlowDot = {
  progress: number
  isBig: boolean
  target: FlowTarget
}

export type FlowView = {
  mode: RoutingMode
  run: number
  counts: Record<ProviderSlot, number>
  isFirstDown: boolean
}

export class FlowSimulation {
  private static readonly weightedTurns = [2, 6, 9]

  mode: RoutingMode = "failover"
  dots: FlowDot[] = []
  isFirstDown = false
  private run = 0
  private counts: Record<ProviderSlot, number> = { first: 0, second: 0 }
  private now = 0
  private startedAt = 0
  private nextSpawnAt = 0
  private spawned = 0
  private routed = 0

  constructor() {
    // Stops short of the failover at 1.8s so the first view shows the first provider going down.
    this.preroll(1.2)
  }

  get isFinished() {
    return this.now - this.startedAt > routingModes[this.mode].durationInSeconds
  }

  view(): FlowView {
    return {
      mode: this.mode,
      run: this.run,
      counts: { ...this.counts },
      isFirstDown: this.isFirstDown,
    }
  }

  reset(mode: RoutingMode, shouldPreroll: boolean) {
    this.mode = mode
    this.run += 1
    this.dots = []
    this.isFirstDown = false
    this.counts = { first: 0, second: 0 }
    this.startedAt = this.now
    this.nextSpawnAt = this.now
    this.spawned = 0
    this.routed = 0
    if (shouldPreroll) this.preroll(2.7)
  }

  step(seconds: number) {
    this.now += seconds
    let hasChanged = false

    if (this.mode === "failover" && !this.isFirstDown && this.now - this.startedAt > 1.8) {
      this.isFirstDown = true
      hasChanged = true
    }

    if (this.now >= this.nextSpawnAt) {
      this.dots.push({
        progress: 0,
        isBig: this.mode === "rule" && this.spawned % 3 === 2,
        target: "dunas",
      })
      this.spawned += 1
      this.nextSpawnAt = this.now + 0.48
    }

    const inFlight: FlowDot[] = []
    for (const dot of this.dots) {
      dot.progress += seconds / (dot.target === "dunas" ? 0.6 : 0.8)
      if (dot.progress < 1) {
        inFlight.push(dot)
        continue
      }

      if (dot.target === "dunas") {
        dot.progress -= 1
        dot.target = this.route(dot)
        this.routed += 1
        inFlight.push(dot)
        continue
      }

      this.counts[dot.target] += 1
      hasChanged = true
    }
    this.dots = inFlight

    return hasChanged
  }

  private route(dot: FlowDot): ProviderSlot {
    const isSecondTurn: Record<RoutingMode, boolean> = {
      failover: this.isFirstDown,
      "round-robin": this.routed % 2 === 1,
      weights: FlowSimulation.weightedTurns.includes(this.routed % 10),
      rule: dot.isBig,
    }
    return isSecondTurn[this.mode] ? "second" : "first"
  }

  private preroll(seconds: number) {
    for (let i = 0; i < seconds * 20; i++) this.step(1 / 20)
  }
}
