"use client"

import { type PixelCanvas, usePixelCanvas } from "@/hooks/use-pixel-canvas"
import { animate, bayer, createRandom } from "@/lib/dither"

type Star = {
  x: number
  y: number
  brightness: number
  speed: number
  phase: number
}

const SKY_HEIGHT = 135

function placeStars(width: number) {
  const random = createRandom(7)
  const stars: Star[] = []
  const attempts = Math.round((90 * width) / 360)
  const maxStars = Math.round((46 * width) / 360)
  for (let i = 0; i < attempts && stars.length < maxStars; i++) {
    const x = Math.floor(random() * width)
    const y = Math.floor(random() * SKY_HEIGHT * 0.8)
    const isBehindCopy = x / width < 0.48 && y / SKY_HEIGHT > 0.26
    const isBehindWindow = x / width > 0.47 && y / SKY_HEIGHT > 0.48
    if (isBehindCopy || isBehindWindow) continue
    stars.push({
      x,
      y,
      brightness: 0.35 + random() * 0.65,
      speed: 0.5 + random() * 1.6,
      phase: random() * 6.28,
    })
  }
  return stars
}

function startStars({ canvas, context, image, width, height }: PixelCanvas) {
  const stars = placeStars(width)
  const { data } = image

  function put(x: number, y: number, intensity: number) {
    if (x < 0 || y < 0 || x >= width || y >= height || intensity <= bayer(x, y)) return
    const [red, green, blue] = intensity > 0.8 ? [244, 239, 230] : [174, 187, 214]
    const offset = (y * width + x) * 4
    data[offset] = red
    data[offset + 1] = green
    data[offset + 2] = blue
    data[offset + 3] = 255
  }

  return animate(canvas, 30, (seconds) => {
    data.fill(0)
    for (const star of stars) {
      const intensity =
        star.brightness * (0.62 + 0.38 * Math.sin(seconds * star.speed + star.phase))
      put(star.x, star.y, intensity)
      if (star.brightness > 0.82) {
        const glow = intensity * 0.5
        put(star.x + 1, star.y, glow)
        put(star.x - 1, star.y, glow)
        put(star.x, star.y + 1, glow)
        put(star.x, star.y - 1, glow)
      }
    }
    context.putImageData(image, 0, 0)
  })
}

export type StarsProps = {
  className?: string
}

export function Stars({ className }: StarsProps) {
  const ref = usePixelCanvas(4, startStars)

  return <canvas ref={ref} className={className} />
}
