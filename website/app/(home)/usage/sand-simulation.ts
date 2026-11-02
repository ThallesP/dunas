export type SandPlan = "free" | "pro"

export type SandPhase = "free" | "full" | "growing" | "pro" | "wind" | "renewed" | "fading"

export type SandView = {
  plan: SandPlan
  phase: SandPhase
  usage: number
  isBusy: boolean
  canUpgrade: boolean
}

export type Jar = {
  left: number
  right: number
  top: number
  bottom: number
}

export type SandGrain = {
  kind: "falling" | "blocked" | "blown"
  x: number
  y: number
  velocityX: number
  velocityY: number
  tone: number
  ageSeconds: number
  lifeSeconds: number
  hasBounced: boolean
  liftY: number
  swirl: number
}

export type SandRequest = {
  y: number
  velocity: number
  messages: number
}

export type SandGust = {
  x: number
  y: number
  length: number
  velocity: number
}

type Pour = {
  grains: number
  grainsPerSecond: number
  owed: number
  isBlocked: boolean
  tone: number
}

export class SandSimulation {
  static readonly limits: Record<SandPlan, number> = { free: 100, pro: 5_000 }
  static readonly initialView: SandView = {
    plan: "free",
    phase: "free",
    usage: 55,
    isBusy: false,
    canUpgrade: false,
  }
  private static readonly gravity = 260
  private static readonly busyPhases: SandPhase[] = ["growing", "wind", "fading"]

  readonly width: number
  readonly height: number
  readonly grid: Uint8Array
  jar: Jar
  lid = 0
  gate = 0
  grains: SandGrain[] = []
  requests: SandRequest[] = []
  gusts: SandGust[] = []
  plan: SandPlan = "free"
  phase: SandPhase = "free"
  usage = SandSimulation.initialView.usage
  private pours: Pour[] = []
  private now = 0
  private phaseStartedAt = 0
  private lastInputAt = Number.NEGATIVE_INFINITY
  private reportedView = ""
  private isHolding = false
  private nextHoldSendAt = 0
  private nextAutoSendAt = 0.5
  private grainCount = 0
  private grainsPerMessage = 0
  private grainsOwed = 0
  private messagesSent = 0
  private isLidClosed = false
  private isGateOpen = false
  private growFrom: Jar | null = null
  private windGrains = 0
  private windUsage = 0

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.grid = new Uint8Array(width * height)
    this.jar = this.jarFor("free")
    this.reset()
  }

  get limit() {
    return SandSimulation.limits[this.plan]
  }

  private get canUpgrade() {
    return this.phase === "full" && this.plan === "free"
  }

  view(): SandView {
    return {
      plan: this.plan,
      phase: this.phase,
      usage: Math.round(this.usage),
      isBusy: SandSimulation.busyPhases.includes(this.phase),
      canUpgrade: this.canUpgrade,
    }
  }

  send() {
    this.lastInputAt = this.now
    this.request(this.plan === "pro" ? 30 : 1)
  }

  hold() {
    this.isHolding = true
    this.nextHoldSendAt = this.now + 0.3
    this.send()
  }

  release() {
    this.isHolding = false
  }

  upgrade() {
    this.lastInputAt = this.now
    if (!this.canUpgrade) return

    this.plan = "pro"
    this.isLidClosed = false
    this.growFrom = { ...this.jar }
    this.setPhase("growing")
  }

  step(seconds: number) {
    this.now += seconds

    this.advancePhase()
    this.repeatHold()
    this.autoplay()
    this.lid += ((this.isLidClosed ? 1 : 0) - this.lid) * Math.min(1, seconds * 9)
    this.gate += ((this.isGateOpen ? 1 : 0) - this.gate) * Math.min(1, seconds * 6)

    for (const request of this.requests) {
      request.velocity += 520 * seconds
      request.y += request.velocity * seconds
    }
    const arrived = this.requests.filter((request) => request.y >= this.jar.top - 11)
    this.requests = this.requests.filter((request) => request.y < this.jar.top - 11)
    for (const request of arrived) this.consume(request.messages)

    for (const pour of this.pours) {
      pour.owed += pour.grainsPerSecond * seconds
      while (pour.owed >= 1 && pour.grains > 0) {
        this.spawnGrain(pour)
        pour.owed -= 1
        pour.grains -= 1
      }
    }
    this.pours = this.pours.filter((pour) => pour.grains > 0)

    if (this.phase === "wind") this.blow(seconds)
    this.moveGrains(seconds)
    this.moveGusts(seconds)
    this.settle()
    this.settle()

    const view = this.viewKey()
    if (view === this.reportedView) return false

    this.reportedView = view
    return true
  }

  private reset() {
    this.grid.fill(0)
    this.grains = []
    this.requests = []
    this.gusts = []
    this.pours = []
    this.plan = "free"
    this.jar = this.jarFor("free")
    this.usage = SandSimulation.initialView.usage
    this.grainCount = 0
    this.grainsOwed = 0
    this.grainsPerMessage = SandSimulation.capacity(this.jar) / this.limit
    this.isLidClosed = false
    this.isGateOpen = false
    this.lid = 0
    this.gate = 0
    this.nextAutoSendAt = this.now + 0.5
    this.setPhase("free")

    const { left, right, bottom } = this.jar
    const rows = (this.usage * this.grainsPerMessage) / (right - left)
    for (let x = left; x < right; x++) {
      const height = Math.round(rows + 2 * Math.sin(x * 0.21 + 1.3))
      for (let row = 0; row < height; row++) {
        this.place(
          x,
          bottom - 1 - row,
          SandSimulation.toneFor((row * (right - left)) / this.grainsPerMessage),
        )
      }
    }
    this.messagesSent = this.usage
  }

  private jarFor(plan: SandPlan): Jar {
    const center = Math.floor(this.width / 2)
    const bottom = this.height - 34
    if (plan === "free") return { left: center - 30, right: center + 30, top: bottom - 48, bottom }

    const half = Math.min(62, center - 10)
    return { left: center - half, right: center + half, top: bottom - 72, bottom }
  }

  private setPhase(phase: SandPhase) {
    this.phase = phase
    this.phaseStartedAt = this.now
    if (SandSimulation.busyPhases.includes(phase)) this.isHolding = false
  }

  private repeatHold() {
    if (!this.isHolding || this.now < this.nextHoldSendAt) return

    this.send()
    this.nextHoldSendAt = this.now + 0.08
  }

  private viewKey() {
    return `${this.plan}:${this.phase}:${Math.round(this.usage)}`
  }

  private advancePhase() {
    const age = this.now - this.phaseStartedAt

    if (this.phase === "full" && age > 0.4) this.isLidClosed = true
    if (this.phase === "full" && this.plan === "pro" && age > 1.6) this.renew()
    if (this.phase === "growing") this.grow(age)
    if (this.phase === "fading" && age > 0.45) this.reset()
  }

  private autoplay() {
    if (this.now - this.lastInputAt < 2.5) return

    const age = this.now - this.phaseStartedAt
    const isSendDue = this.now >= this.nextAutoSendAt

    if (this.phase === "free" && isSendDue) {
      this.request(1)
      this.nextAutoSendAt = this.now + 0.03 + Math.random() * 0.03
    }
    if (this.phase === "full" && isSendDue && age > 0.6) {
      this.request(1)
      this.nextAutoSendAt = Number.POSITIVE_INFINITY
    }
    if (this.canUpgrade && age > 1.4) this.upgrade()
    if (this.phase === "pro" && isSendDue && age < 2.2) {
      this.request(30 + Math.floor(Math.random() * 30))
      this.nextAutoSendAt = this.now + 0.07
    }
    if (this.phase === "pro" && age > 2.6) this.renew()
    if (this.phase === "renewed" && age > 1) this.setPhase("fading")
  }

  private request(messages: number) {
    if (SandSimulation.busyPhases.includes(this.phase)) return
    if (this.phase === "renewed") this.setPhase("pro")

    this.requests.push({ y: -2, velocity: 80, messages })
  }

  private consume(messages: number) {
    if (this.usage >= this.limit) {
      this.isLidClosed = true
      this.pour(10, true)
      return
    }

    const allowed = Math.min(messages, this.limit - this.usage)
    this.usage += allowed
    this.messagesSent += 1
    this.grainsOwed += allowed * this.grainsPerMessage
    const grains = Math.floor(this.grainsOwed)
    this.grainsOwed -= grains
    this.pour(grains, false)

    if (this.usage < this.limit) return

    this.nextAutoSendAt = this.now
    this.setPhase("full")
  }

  private pour(grains: number, isBlocked: boolean) {
    if (grains <= 0) return

    this.pours.push({
      grains,
      grainsPerSecond: Math.max(160, grains / 0.12),
      owed: 1,
      isBlocked,
      tone: SandSimulation.toneFor(this.messagesSent),
    })
  }

  private grow(age: number) {
    if (!this.growFrom) return

    const from = this.growFrom
    const to = this.jarFor("pro")
    const progress = Math.min(1, age / 1.1)
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
    this.jar = {
      left: Math.round(from.left + (to.left - from.left) * eased),
      right: Math.round(from.right + (to.right - from.right) * eased),
      top: Math.round(from.top + (to.top - from.top) * eased),
      bottom: from.bottom,
    }
    if (progress < 1) return

    this.growFrom = null
    this.grainsPerMessage = Math.max(
      0.3,
      (SandSimulation.capacity(to) - this.grainCount) / (this.limit - this.usage),
    )
    this.nextAutoSendAt = this.now
    this.setPhase("pro")
  }

  private renew() {
    this.windGrains = Math.max(1, this.grainCount)
    this.windUsage = this.usage
    this.requests = []
    this.pours = []
    this.isLidClosed = false
    this.isGateOpen = true
    for (let i = 0; i < 3; i++) this.spawnGust()
    this.setPhase("wind")
  }

  private blow(seconds: number) {
    const age = this.now - this.phaseStartedAt
    if (age > 0.25)
      this.lift(Math.max(6, Math.ceil((this.windGrains * seconds * Math.min(1, age / 0.6)) / 1.2)))
    if (Math.random() < seconds * 5) this.spawnGust()
    this.usage = this.windUsage * (this.grainCount / this.windGrains)
    if (this.grainCount > 0 || age < 0.8) return

    this.usage = 0
    this.grainsOwed = 0
    this.grainsPerMessage = SandSimulation.capacity(this.jar) / this.limit
    this.isGateOpen = false
    this.setPhase("renewed")
  }

  private spawnGrain(pour: Pour) {
    const { left, right, top } = this.jar
    const center = (left + right) / 2
    const nozzle = top - 10
    const fallSeconds = Math.sqrt(
      (2 * Math.max(8, this.surfaceAt(Math.round(center)) - nozzle)) / SandSimulation.gravity,
    )
    const spread = ((Math.random() + Math.random() - 1) * (right - left) * 0.48) / fallSeconds

    this.grains.push({
      kind: pour.isBlocked ? "blocked" : "falling",
      x: center,
      y: nozzle + 1,
      velocityX: pour.isBlocked ? (Math.random() - 0.5) * 14 : spread,
      velocityY: 20 + Math.random() * 14,
      tone: Math.max(1, Math.min(255, pour.tone + Math.round((Math.random() - 0.5) * 50))),
      ageSeconds: 0,
      lifeSeconds: 1,
      hasBounced: false,
      liftY: 0,
      swirl: 0,
    })
  }

  private moveGrains(seconds: number) {
    this.grains = this.grains.filter((grain) => {
      grain.ageSeconds += seconds
      if (grain.kind === "blown") return this.moveBlown(grain, seconds)

      return this.moveFalling(grain, seconds)
    })
  }

  private moveFalling(grain: SandGrain, seconds: number) {
    const { left, right, top, bottom } = this.jar
    grain.velocityY += SandSimulation.gravity * seconds
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(grain.velocityX * seconds), Math.abs(grain.velocityY * seconds))),
    )

    for (let step = 0; step < steps; step++) {
      let x = grain.x + (grain.velocityX * seconds) / steps
      const y = grain.y + (grain.velocityY * seconds) / steps
      const isAboveJar = x >= left - 1 && x < right + 1
      const isHittingLid =
        (this.lid > 0.5 || grain.kind === "blocked") &&
        !grain.hasBounced &&
        isAboveJar &&
        grain.y < top - 2 &&
        y >= top - 3
      if (isHittingLid) {
        grain.kind = "blocked"
        grain.hasBounced = true
        grain.y = top - 3
        grain.velocityY = -(25 + Math.random() * 40)
        grain.velocityX = (Math.random() - 0.5) * 70
        grain.ageSeconds = 0
        grain.lifeSeconds = 0.6
        return true
      }

      if (grain.kind === "falling" && y >= top) {
        x = Math.min(right - 0.01, Math.max(left, x))
        const isLanding =
          Math.floor(y) >= bottom || this.grid[Math.floor(y) * this.width + Math.floor(x)]
        if (isLanding) {
          this.land(Math.floor(x), Math.min(bottom - 1, Math.floor(grain.y)), grain.tone)
          return false
        }
      }

      grain.x = x
      grain.y = y
    }

    if (grain.hasBounced && grain.ageSeconds > grain.lifeSeconds) return false
    return grain.y < this.height
  }

  private moveBlown(grain: SandGrain, seconds: number) {
    const rise = grain.y > grain.liftY ? -36 : Math.sin(grain.ageSeconds * 5 + grain.swirl) * 12
    grain.velocityY += (rise - grain.velocityY) * Math.min(1, seconds * 6)
    grain.velocityX +=
      ((110 + grain.swirl * 16) * Math.min(1, grain.ageSeconds * 2) - grain.velocityX) *
      Math.min(1, seconds * 2.4)
    grain.x += grain.velocityX * seconds
    grain.y += grain.velocityY * seconds
    return grain.x < this.width + 12 && grain.ageSeconds < grain.lifeSeconds
  }

  private moveGusts(seconds: number) {
    for (const gust of this.gusts) gust.x += gust.velocity * seconds
    this.gusts = this.gusts.filter((gust) => gust.x - gust.length < this.width)
  }

  private land(x: number, fromY: number, tone: number) {
    let y = fromY
    while (y >= this.jar.top && this.grid[y * this.width + x]) y--
    if (y >= this.jar.top) this.place(x, y, tone)
  }

  private place(x: number, y: number, tone: number) {
    this.grid[y * this.width + x] = tone
    this.grainCount += 1
  }

  private lift(count: number) {
    const { left, right, bottom } = this.jar
    const columns: number[] = []
    for (let x = left; x < right; x++) {
      if (this.surfaceAt(x) < bottom) columns.push(x)
    }

    for (let i = 0; i < count && columns.length > 0; i++) {
      const index = Math.floor(Math.random() * columns.length)
      const x = columns[index] ?? left
      const y = this.surfaceAt(x)
      const cell = y * this.width + x
      const tone = this.grid[cell]
      if (y >= bottom || !tone) {
        columns.splice(index, 1)
        continue
      }

      if (Math.random() < 0.32) {
        this.grains.push({
          kind: "blown",
          x,
          y,
          velocityX: 8,
          velocityY: -20,
          tone,
          ageSeconds: 0,
          lifeSeconds: 1.1 + Math.random() * 1.4,
          hasBounced: false,
          liftY: y - 3 - Math.random() * 12,
          swirl: Math.random() * Math.PI * 2,
        })
      }
      this.grid[cell] = 0
      this.grainCount -= 1
    }
  }

  private spawnGust() {
    this.gusts.push({
      x: -40 - Math.random() * 30,
      y: 10 + Math.floor(Math.random() * (this.height - 30)),
      length: 14 + Math.floor(Math.random() * 24),
      velocity: 170 + Math.random() * 90,
    })
  }

  private settle() {
    const { left, right, top, bottom } = this.jar
    for (let y = bottom - 2; y >= top; y--) {
      const isLeftToRight = (y + Math.floor(this.now * 1000)) % 2 === 0
      for (let i = 0; i < right - left; i++) {
        const x = isLeftToRight ? left + i : right - 1 - i
        const cell = y * this.width + x
        if (!this.grid[cell]) continue

        const below = cell + this.width
        if (!this.grid[below]) {
          this.move(cell, below)
          continue
        }

        const side = Math.random() < 0.5 ? -1 : 1
        if (x + side >= left && x + side < right && !this.grid[below + side]) {
          this.move(cell, below + side)
          continue
        }
        if (x - side >= left && x - side < right && !this.grid[below - side]) {
          this.move(cell, below - side)
          continue
        }

        const canSlide =
          x + 2 * side >= left &&
          x + 2 * side < right &&
          !this.grid[cell + side] &&
          !this.grid[below + 2 * side]
        if (canSlide && Math.random() < 0.55) this.move(cell, below + 2 * side)
      }
    }
  }

  private move(from: number, to: number) {
    const tone = this.grid[from]
    if (!tone) return

    this.grid[to] = tone
    this.grid[from] = 0
  }

  private surfaceAt(x: number) {
    for (let y = this.jar.top; y < this.jar.bottom; y++) {
      if (this.grid[y * this.width + x]) return y
    }
    return this.jar.bottom
  }

  private static capacity({ left, right, top, bottom }: Jar) {
    return (right - left) * (bottom - top) * 0.95
  }

  private static toneFor(index: number) {
    const tone =
      0.5 +
      0.15 * Math.sin(index * 0.37) +
      0.06 * Math.sin(index * 1.7) +
      (Math.random() - 0.5) * 0.24
    return Math.max(1, Math.min(255, Math.round(tone * 255)))
  }
}
