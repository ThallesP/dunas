type WheelSample = {
  time: number
  delta: number
}

export class Overscroll {
  private static readonly stiffness = 80
  private static readonly damping = 2 * Math.sqrt(Overscroll.stiffness)
  private static readonly releaseSeconds = 0.18
  private static readonly resistance = 0.55
  private static readonly sampleWindowMs = 64
  private static readonly burstGapMs = 140
  private static readonly minSpeed = 0.6
  private static readonly maxSpeed = 10
  private static readonly pullGain = 140

  limit: number
  private stretch = 0
  private velocity = 0
  private pull = 0
  private isHeld = false
  private samples: WheelSample[] = []
  private lastWheelAt = Number.NEGATIVE_INFINITY
  private burstSpeed = 0

  constructor(limit: number) {
    this.limit = limit
  }

  get offset() {
    const distance = Math.abs(this.stretch)
    const offset = this.limit * (1 - 1 / ((distance * Overscroll.resistance) / this.limit + 1))
    return Math.sign(this.stretch) * offset
  }

  get isResting() {
    return (
      !this.isHeld &&
      this.pull < 0.5 &&
      Math.abs(this.stretch) < 0.5 &&
      Math.abs(this.velocity) < 10
    )
  }

  wheel(delta: number, time: number, isAtBottom: boolean) {
    if (time - this.lastWheelAt > Overscroll.burstGapMs) {
      this.samples = []
      this.burstSpeed = 0
    }
    this.lastWheelAt = time
    if (delta <= 0) return

    this.samples = this.samples.filter((sample) => time - sample.time < Overscroll.sampleWindowMs)
    this.samples.push({ time, delta })
    if (!isAtBottom) return

    const distance = this.samples.reduce((sum, sample) => sum + sample.delta, 0)
    const speed = distance / Overscroll.sampleWindowMs
    if (speed <= this.burstSpeed * 1.2) return

    this.burstSpeed = speed
    this.fling(speed)
  }

  fling(speed: number) {
    if (speed < Overscroll.minSpeed) return

    const excess = Math.min(speed, Overscroll.maxSpeed) - Overscroll.minSpeed
    this.pull = Math.max(this.pull, excess ** 2 * Overscroll.pullGain)
  }

  hold() {
    this.isHeld = true
    this.velocity = 0
    this.pull = 0
  }

  drag(distance: number) {
    this.stretch = Math.max(0, this.stretch + distance)
  }

  release() {
    this.isHeld = false
  }

  step(seconds: number) {
    if (this.isHeld) return

    this.pull *= Math.exp(-seconds / Overscroll.releaseSeconds)
    const substeps = 4
    const dt = seconds / substeps
    for (let step = 0; step < substeps; step++) {
      const force =
        -Overscroll.stiffness * (this.stretch - this.pull) - Overscroll.damping * this.velocity
      this.velocity += force * dt
      this.stretch += this.velocity * dt
    }
  }
}
