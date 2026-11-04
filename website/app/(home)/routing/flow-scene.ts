import type { PixelCanvas } from "@/hooks/use-pixel-canvas"
import { bayer } from "@/lib/dither"
import type { FlowDot, FlowSimulation, FlowTarget } from "./flow-simulation"

type Point = { x: number; y: number }

type Box = { left: number; top: number; right: number; bottom: number }

type Curve = [Point, Point, Point, Point]

type Color = [number, number, number]

export type FlowNodes = Record<"app" | "dunas" | "first" | "second", DOMRect>

export class FlowScene {
  private static readonly colors: Record<
    "line" | "lineDown" | "dot" | "trail" | "haloOuter" | "haloInner",
    Color
  > = {
    line: [70, 86, 122],
    lineDown: [38, 48, 72],
    dot: [244, 239, 230],
    trail: [174, 187, 214],
    haloOuter: [14, 19, 31],
    haloInner: [24, 32, 50],
  }

  private readonly pixels: PixelCanvas
  private readonly curves: Record<FlowTarget, Curve>
  private readonly lines: Record<FlowTarget, Point[]>
  private readonly halo: (Point & { color: Color })[]

  constructor(pixels: PixelCanvas, nodes: FlowNodes) {
    const origin = pixels.canvas.getBoundingClientRect()
    const scale = pixels.width / origin.width
    const app = FlowScene.toCanvas(nodes.app, origin, scale)
    const dunas = FlowScene.toCanvas(nodes.dunas, origin, scale)
    const first = FlowScene.toCanvas(nodes.first, origin, scale)
    const second = FlowScene.toCanvas(nodes.second, origin, scale)
    const isHorizontal = dunas.left >= app.right

    this.pixels = pixels
    this.curves = {
      dunas: FlowScene.connect(app, dunas, isHorizontal),
      first: FlowScene.connect(dunas, first, isHorizontal),
      second: FlowScene.connect(dunas, second, isHorizontal),
    }
    this.lines = {
      dunas: FlowScene.trace(this.curves.dunas),
      first: FlowScene.trace(this.curves.first),
      second: FlowScene.trace(this.curves.second),
    }
    this.halo = FlowScene.glow({
      x: Math.round((dunas.left + dunas.right) / 2),
      y: Math.round((dunas.top + dunas.bottom) / 2),
    })
  }

  draw(simulation: FlowSimulation) {
    const { context, image } = this.pixels
    const { line, lineDown } = FlowScene.colors

    image.data.fill(0)
    for (const { x, y, color } of this.halo) this.put(x, y, color, 1)
    for (const { x, y } of this.lines.dunas) this.put(x, y, line, 0.72)
    for (const { x, y } of this.lines.second) this.put(x, y, line, 0.72)
    for (const { x, y } of this.lines.first) {
      if (simulation.isFirstDown) this.put(x, y, lineDown, 0.4)
      else this.put(x, y, line, 0.72)
    }
    for (const dot of simulation.dots) this.drawDot(dot)

    context.putImageData(image, 0, 0)
  }

  private drawDot({ progress, isBig, target }: FlowDot) {
    const curve = this.curves[target]

    for (let step = 7; step >= 1; step--) {
      const trailProgress = progress - step * 0.035
      if (trailProgress < 0) continue

      const { x, y } = FlowScene.pointOn(curve, trailProgress)
      this.put(Math.round(x), Math.round(y), FlowScene.colors.trail, 0.95 - step * 0.12)
    }

    const center = FlowScene.pointOn(curve, progress)
    const size = isBig ? 4 : 3
    const left = Math.round(center.x) - Math.floor(size / 2)
    const top = Math.round(center.y) - Math.floor(size / 2)
    for (let y = top; y < top + size; y++) {
      for (let x = left; x < left + size; x++) this.put(x, y, FlowScene.colors.dot, 1)
    }
  }

  private put(x: number, y: number, [red, green, blue]: Color, intensity: number) {
    const { width, height, image } = this.pixels
    if (x < 0 || y < 0 || x >= width || y >= height || intensity <= bayer(x, y)) return

    const offset = (y * width + x) * 4
    image.data[offset] = red
    image.data[offset + 1] = green
    image.data[offset + 2] = blue
    image.data[offset + 3] = 255
  }

  private static toCanvas(rect: DOMRect, origin: DOMRect, scale: number): Box {
    return {
      left: (rect.left - origin.left) * scale,
      top: (rect.top - origin.top) * scale,
      right: (rect.right - origin.left) * scale,
      bottom: (rect.bottom - origin.top) * scale,
    }
  }

  private static connect(from: Box, to: Box, isHorizontal: boolean): Curve {
    if (isHorizontal) {
      const start = { x: from.right, y: (from.top + from.bottom) / 2 }
      const end = { x: to.left, y: (to.top + to.bottom) / 2 }
      const bend = (end.x - start.x) * 0.45
      return [start, { x: start.x + bend, y: start.y }, { x: end.x - bend, y: end.y }, end]
    }

    const start = { x: (from.left + from.right) / 2, y: from.bottom }
    const end = { x: (to.left + to.right) / 2, y: to.top }
    const bend = (end.y - start.y) * 0.45
    return [start, { x: start.x, y: start.y + bend }, { x: end.x, y: end.y - bend }, end]
  }

  private static pointOn([start, first, second, end]: Curve, t: number): Point {
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const d = t * t * t
    return {
      x: a * start.x + b * first.x + c * second.x + d * end.x,
      y: a * start.y + b * first.y + c * second.y + d * end.y,
    }
  }

  private static trace(curve: Curve) {
    const seen = new Set<string>()
    const points: Point[] = []
    for (let i = 0; i <= 600; i++) {
      const { x, y } = FlowScene.pointOn(curve, i / 600)
      const point = { x: Math.round(x), y: Math.round(y) }
      const key = `${point.x},${point.y}`
      if (seen.has(key)) continue

      seen.add(key)
      points.push(point)
    }
    return points
  }

  private static glow(center: Point) {
    const { haloInner, haloOuter } = FlowScene.colors
    const halo: (Point & { color: Color })[] = []
    for (let y = center.y - 40; y <= center.y + 40; y++) {
      for (let x = center.x - 52; x <= center.x + 52; x++) {
        const distance = Math.hypot((x - center.x) / 1.3, y - center.y)
        const strength = 0.62 - distance / 62
        if (strength > bayer(x, y))
          halo.push({ x, y, color: strength > 0.42 ? haloInner : haloOuter })
      }
    }
    return halo
  }
}
