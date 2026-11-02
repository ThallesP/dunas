import { bayer, createRandom } from "@/lib/dither"

export type Point = {
  x: number
  y: number
}

type Grain = {
  x: number
  y: number
  velocityX: number
  velocityY: number
  groundY: number
  ageSeconds: number
  lifeSeconds: number
  color: string
  phase: number
}

export class SandGrains {
  private static readonly maxGrains = 240
  private static readonly maxPushSpeed = 420
  private grains: Grain[] = []
  private readonly random = createRandom(11)
  private readonly isLit: Uint8ClampedArray
  readonly width: number
  readonly height: number

  private constructor(isLit: Uint8ClampedArray, width: number, height: number) {
    this.isLit = isLit
    this.width = width
    this.height = height
  }

  static async load(src: string) {
    const image = new Image()
    image.src = src
    await image.decode()

    const scratch = document.createElement("canvas")
    scratch.width = image.naturalWidth
    scratch.height = image.naturalHeight
    const context = scratch.getContext("2d")
    if (!context) return null

    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, scratch.width, scratch.height)
    const isLit = data.filter((_, index) => index % 4 === 0).map((red) => (red > 150 ? 1 : 0))
    return new SandGrains(isLit, scratch.width, scratch.height)
  }

  private static colorFor(tone: number) {
    if (tone > 0.94) return "#f4efe6"
    if (tone > 0.3) return "#aebbd6"
    return "#2c3a58"
  }

  get isSettled() {
    return this.grains.length === 0
  }

  blow(from: Point, to: Point, elapsedSeconds: number) {
    const velocityX = (to.x - from.x) / elapsedSeconds
    const velocityY = (to.y - from.y) / elapsedSeconds
    const speed = Math.hypot(velocityX, velocityY)
    const gust = Math.min(1, (speed - 50) / 650)
    if (gust <= 0) return

    const push = Math.min(1, SandGrains.maxPushSpeed / speed)
    const distance = speed * elapsedSeconds
    const attempts = Math.floor(distance * (0.15 + 3 * gust * gust) + this.random())
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (this.grains.length >= SandGrains.maxGrains) return

      const along = this.random()
      const angle = this.random() * Math.PI * 2
      const radius = this.random() * (2 + 5 * gust)
      const x = Math.round(from.x + (to.x - from.x) * along + Math.cos(angle) * radius)
      const y = Math.round(from.y + (to.y - from.y) * along + Math.sin(angle) * radius)
      if (x < 0 || x >= this.width || this.isLit[y * this.width + x] !== 1) continue

      const share = push * (0.3 + 0.5 * this.random())
      this.grains.push({
        x,
        y,
        velocityX: velocityX * share,
        velocityY: velocityY * share * 0.4 - (20 + 50 * this.random()) * gust,
        groundY: y + 1 + this.random() * 3,
        ageSeconds: 0,
        lifeSeconds: 0.5 + 0.9 * this.random() * gust,
        color: SandGrains.colorFor(this.random()),
        phase: this.random() * Math.PI * 2,
      })
    }
  }

  step(elapsedSeconds: number) {
    const drag = Math.exp(-elapsedSeconds * 2.4)
    for (const grain of this.grains) {
      grain.ageSeconds += elapsedSeconds
      const swirl = grain.ageSeconds * 8 + grain.phase
      grain.velocityX = grain.velocityX * drag + Math.sin(swirl) * 60 * elapsedSeconds
      grain.velocityY = grain.velocityY * drag + (120 + Math.cos(swirl) * 40) * elapsedSeconds
      grain.x += grain.velocityX * elapsedSeconds
      grain.y += grain.velocityY * elapsedSeconds
    }
    this.grains = this.grains.filter(
      (grain) =>
        grain.ageSeconds < grain.lifeSeconds && (grain.velocityY < 0 || grain.y < grain.groundY),
    )
  }

  draw(context: CanvasRenderingContext2D) {
    context.clearRect(0, 0, this.width, this.height)
    for (const grain of this.grains) {
      const x = Math.round(grain.x)
      const y = Math.round(grain.y)
      const fade = 1 - grain.ageSeconds / grain.lifeSeconds
      if (fade < bayer(x, y) * 0.8) continue

      context.fillStyle = fade < 0.3 ? "#2c3a58" : grain.color
      context.fillRect(x, y, 1, 1)
    }
  }
}
