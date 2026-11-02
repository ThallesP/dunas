import type { PixelCanvas } from "@/hooks/use-pixel-canvas"
import { bayer } from "@/lib/dither"
import type { SandGrain, SandSimulation } from "./sand-simulation"

type Color = [number, number, number]

export class SandScene {
  private static readonly colors: Record<
    "glass" | "pipe" | "pipeDim" | "wall" | "wallLit" | "moon" | "request" | "gust" | "gustLit",
    Color
  > = {
    glass: [11, 15, 24],
    pipe: [44, 58, 88],
    pipeDim: [28, 37, 56],
    wall: [86, 100, 127],
    wallLit: [142, 155, 182],
    moon: [174, 187, 214],
    request: [244, 239, 230],
    gust: [27, 35, 53],
    gustLit: [40, 51, 76],
  }
  private static readonly sand: Color[] = [
    [26, 31, 48],
    [53, 47, 62],
    [95, 67, 55],
    [143, 96, 62],
    [189, 129, 73],
    [220, 164, 104],
    [242, 204, 148],
    [249, 230, 196],
    [253, 244, 227],
  ]
  private static readonly glow: Color[] = [
    [8, 11, 18],
    [10, 14, 23],
    [13, 18, 32],
    [17, 24, 40],
  ]

  private readonly pixels: PixelCanvas
  private readonly backdrop: Uint8ClampedArray

  constructor(pixels: PixelCanvas) {
    this.pixels = pixels
    this.backdrop = this.paintBackdrop()
  }

  draw(simulation: SandSimulation) {
    const { context, image } = this.pixels

    image.data.set(this.backdrop)
    this.drawGusts(simulation)
    this.drawPipe(simulation)
    this.drawSand(simulation)
    this.drawJar(simulation)
    for (const grain of simulation.grains) this.drawGrain(grain)

    context.putImageData(image, 0, 0)
  }

  private paintBackdrop() {
    const { width, height, image } = this.pixels
    const center = width / 2

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distance = Math.hypot((x - center) / 130, (y - 50) / 70)
        const level = Math.max(0, 1 - distance) ** 1.6 * 3
        this.put(x, y, SandScene.glow[Math.min(3, Math.floor(level + bayer(x, y)))])
      }
    }

    for (let x = 0; x < width; x++) {
      const crest = Math.round(
        height - 6 + 2.2 * Math.sin(x * 0.03 + 0.4) + 1.4 * Math.sin(x * 0.083 + 2),
      )
      for (let y = crest; y < height; y++) {
        const depth = y - crest
        const isLit = depth === 0 && bayer(x, y) < 0.6
        const isCrest = depth === 0 || (depth < 3 && bayer(x, y) < 0.5)
        if (isLit) this.put(x, y, [31, 42, 62])
        else if (isCrest) this.put(x, y, [22, 30, 46])
        else this.put(x, y, [10, 14, 22])
      }
    }

    return image.data.slice()
  }

  private drawGusts({ gusts }: SandSimulation) {
    for (const gust of gusts) {
      for (let step = 0; step < gust.length; step++) {
        const x = Math.round(gust.x) - step
        const strength = 1 - step / gust.length
        if (strength * 0.7 <= bayer(x, gust.y)) continue

        this.put(x, gust.y, strength > 0.6 ? SandScene.colors.gustLit : SandScene.colors.gust)
      }
    }
  }

  private drawPipe({ jar, requests }: SandSimulation) {
    const { pipe, pipeDim, wall, moon, request } = SandScene.colors
    const center = Math.floor((jar.left + jar.right) / 2)
    const nozzle = jar.top - 10

    for (let y = 0; y < nozzle; y++) {
      this.put(center - 1, y, y % 4 === 0 ? pipeDim : pipe)
      this.put(center, y, y % 4 === 0 ? pipeDim : pipe)
    }
    for (let x = center - 2; x <= center + 1; x++) this.put(x, nozzle, wall)

    for (const { y: requestY } of requests) {
      const y = Math.round(requestY)
      for (let step = 1; step <= 5; step++) {
        if (1 - step / 6 <= bayer(center, y - step) * 0.9) continue

        this.put(center - 1, y - step, moon)
        this.put(center, y - step, moon)
      }
      for (let step = 0; step < 2; step++) {
        this.put(center - 1, y + step, request)
        this.put(center, y + step, request)
      }
    }
  }

  private drawSand({ jar, grid, width }: SandSimulation) {
    const { left, right, top, bottom } = jar

    for (let x = left; x < right; x++) {
      let surface = bottom
      for (let y = top; y < bottom; y++) {
        const cell = y * width + x
        const tone = grid[cell]
        if (!tone) {
          this.put(x, y, SandScene.colors.glass)
          continue
        }

        surface = Math.min(surface, y)
        const isOpen = y === top || !grid[cell - width]
        const isOpenLeft = x > left && (y === top || !grid[cell - width - 1])
        const openLight = isOpenLeft ? 0.33 : 0.2
        const depth = Math.min((y - surface) / 36, 1)
        const light =
          0.5 +
          (tone / 255 - 0.5) * 0.6 +
          (isOpen ? openLight : 0) -
          depth * 0.3 +
          0.07 * (1 - (x - left) / (right - left))
        const level = Math.floor(light * 8 + bayer(x, y) - 0.5)
        this.put(x, y, SandScene.sand[Math.max(0, Math.min(8, level))])
      }
    }
  }

  private drawJar({ jar, lid, gate }: SandSimulation) {
    const { pipe, wall, wallLit, moon } = SandScene.colors
    const { left, right, top, bottom } = jar
    const gateTop = top - 1 + Math.round(gate * (bottom - top + 1))

    for (let y = top - 1; y <= bottom + 1; y++) {
      const shine = (1 - (y - top) / (bottom - top)) * 0.7
      this.put(left - 2, y, pipe)
      this.put(left - 1, y, bayer(left - 1, y) < shine ? wallLit : wall)
      if (y < gateTop) continue

      this.put(right, y, wall)
      this.put(right + 1, y, pipe)
    }
    for (let x = left - 2; x <= right + 1; x++) {
      this.put(x, bottom, wall)
      this.put(x, bottom + 1, pipe)
    }

    const lidReach = Math.ceil(((right - left + 2) / 2) * lid)
    for (let step = 0; step < lidReach; step++) {
      for (const x of [left - 1 + step, right - step]) {
        this.put(x, top - 2, moon)
        this.put(x, top - 1, wall)
      }
    }
  }

  private drawGrain(grain: SandGrain) {
    const x = Math.round(grain.x)
    const y = Math.round(grain.y)

    if (grain.kind === "blown") {
      const edgeFade = x > this.pixels.width - 50 ? Math.max(0, (this.pixels.width - x) / 50) : 1
      const fade = Math.max(0, 1 - grain.ageSeconds / grain.lifeSeconds) * edgeFade
      for (let step = 6; step >= 0; step--) {
        const strength = (1 - step / 7) * fade
        if (strength <= bayer(x - step, y) * 0.95 + 0.04) continue

        this.put(x - step, y, SandScene.sand[Math.min(7, 1 + Math.floor(strength * 5.2))])
      }
      return
    }

    const isFadedOut = grain.hasBounced && 1 - grain.ageSeconds / grain.lifeSeconds <= bayer(x, y)
    if (isFadedOut) return

    this.put(x, y, SandScene.sand[bayer(x, y) < 0.5 ? 7 : 6])
  }

  private put(x: number, y: number, color: Color | undefined) {
    const { width, height, image } = this.pixels
    if (!color || x < 0 || y < 0 || x >= width || y >= height) return

    const [red, green, blue] = color
    const offset = (y * width + x) * 4
    image.data[offset] = red
    image.data[offset + 1] = green
    image.data[offset + 2] = blue
    image.data[offset + 3] = 255
  }
}
