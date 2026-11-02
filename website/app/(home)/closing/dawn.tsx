"use client"

import { type PixelCanvas, usePixelCanvas } from "@/hooks/use-pixel-canvas"
import { animate, bayer } from "@/lib/dither"

type Level = 0 | 1 | 2 | 3

const ramp: Record<Level, [number, number, number]> = {
  0: [5, 7, 11],
  1: [20, 16, 18],
  2: [58, 36, 22],
  3: [201, 139, 78],
}

function toLevel(value: number): Level {
  if (value >= 3) return 3
  if (value >= 2) return 2
  if (value >= 1) return 1
  return 0
}

function startDawn({ canvas, context, image, width, height }: PixelCanvas) {
  const { data } = image

  return animate(canvas, 8, (seconds) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = (x / width - 0.5) * 2
        const v = y / height
        const glow = Math.max(0, 1 - Math.abs(u) * 0.7)
        const light =
          v ** 2.4 * glow * 1.05 + v ** 6 * 0.25 + Math.sin(seconds * 0.6 + x * 0.05) * 0.012
        const scaled = Math.max(0, Math.min(0.999, light)) * 3
        const base = Math.floor(scaled)
        const [red, green, blue] = ramp[toLevel(base + (scaled - base > bayer(x, y) ? 1 : 0))]
        const offset = (y * width + x) * 4
        data[offset] = red
        data[offset + 1] = green
        data[offset + 2] = blue
        data[offset + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
  })
}

export type DawnProps = {
  className?: string
}

export function Dawn({ className }: DawnProps) {
  const ref = usePixelCanvas(4, startDawn)

  return <canvas ref={ref} className={className} />
}
