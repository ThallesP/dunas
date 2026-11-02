"use client"

import { type PixelCanvas, usePixelCanvas } from "@/hooks/use-pixel-canvas"
import { bayer } from "@/lib/dither"
import styles from "./details.module.css"

function drawGlow({ context, image, width, height }: PixelCanvas) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x / width - 0.5) * 1.6
      const v = 1 - y / height
      const glow = Math.max(0, 0.34 - Math.sqrt(u * u + v * v * 1.4) * 0.42)
      if (glow * 1.4 <= bayer(x, y)) continue

      const isMid = glow > 0.27
      const offset = (y * width + x) * 4
      image.data[offset] = isMid ? 44 : 17
      image.data[offset + 1] = isMid ? 58 : 24
      image.data[offset + 2] = isMid ? 88 : 39
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)

  return () => {}
}

export function DitherGlow() {
  const ref = usePixelCanvas(4, drawGlow)

  return <canvas ref={ref} className={styles.glow} />
}
