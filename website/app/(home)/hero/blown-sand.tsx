"use client"

import { useEffect, useRef } from "react"
import { prefersReducedMotion } from "@/lib/dither"
import { SandGrains } from "./sand-grains"

type Sample = {
  clientX: number
  clientY: number
  timeMs: number
}

export type BlownSandProps = {
  src: string
  className?: string
}

export function BlownSand({ src, className }: BlownSandProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext("2d")
    const scene = canvas?.parentElement
    if (!canvas || !context || !scene || prefersReducedMotion()) return

    let sand: SandGrains | null = null
    let isCancelled = false
    let frame = 0
    let lastFrameMs = 0
    let last: Sample | null = null

    SandGrains.load(src).then((grains) => {
      if (!grains || isCancelled) return
      canvas.width = grains.width
      canvas.height = grains.height
      sand = grains
    })

    const tick = (timeMs: number) => {
      if (!sand) return
      sand.step(Math.min(0.05, (timeMs - lastFrameMs) / 1000))
      lastFrameMs = timeMs
      sand.draw(context)
      frame = sand.isSettled ? 0 : requestAnimationFrame(tick)
    }

    const blow = (sample: Sample) => {
      const previous = last
      last = sample
      if (!sand || !previous) return

      const elapsedMs = sample.timeMs - previous.timeMs
      if (elapsedMs <= 0 || elapsedMs > 100) return

      const bounds = scene.getBoundingClientRect()
      const isInside =
        sample.clientX >= bounds.left &&
        sample.clientX <= bounds.right &&
        sample.clientY >= bounds.top &&
        sample.clientY <= bounds.bottom
      if (!isInside) return

      const rect = canvas.getBoundingClientRect()
      const scale = canvas.width / rect.width
      sand.blow(
        { x: (previous.clientX - rect.left) * scale, y: (previous.clientY - rect.top) * scale },
        { x: (sample.clientX - rect.left) * scale, y: (sample.clientY - rect.top) * scale },
        elapsedMs / 1000,
      )
      if (frame || sand.isSettled) return

      lastFrameMs = performance.now()
      frame = requestAnimationFrame(tick)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return
      blow({ clientX: event.clientX, clientY: event.clientY, timeMs: event.timeStamp })
    }
    const handleTouchStart = () => {
      last = null
    }
    const handleTouchMove = (event: TouchEvent) => {
      const [touch] = event.touches
      if (!touch) return
      blow({ clientX: touch.clientX, clientY: touch.clientY, timeMs: event.timeStamp })
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("touchstart", handleTouchStart, { passive: true })
    window.addEventListener("touchmove", handleTouchMove, { passive: true })

    return () => {
      isCancelled = true
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("touchstart", handleTouchStart)
      window.removeEventListener("touchmove", handleTouchMove)
    }
  }, [src])

  return <canvas ref={ref} className={className} width={0} height={0} aria-hidden />
}
