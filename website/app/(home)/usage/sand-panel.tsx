"use client"

import { type MouseEvent, useCallback, useRef, useState } from "react"
import { type PixelCanvas, usePixelCanvas } from "@/hooks/use-pixel-canvas"
import { animate } from "@/lib/dither"
import { SandScene } from "./sand-scene"
import { type SandPlan, SandSimulation } from "./sand-simulation"
import styles from "./usage.module.css"

const planNames: Record<SandPlan, string> = { free: "Free", pro: "Pro" }

export function SandPanel() {
  const [view, setView] = useState(SandSimulation.initialView)
  const simulation = useRef<SandSimulation>(null)

  const start = useCallback((pixels: PixelCanvas) => {
    const sand = new SandSimulation(pixels.width, pixels.height)
    const scene = new SandScene(pixels)
    simulation.current = sand
    setView(sand.view())

    let lastSeconds: number | null = null
    const stop = animate(
      pixels.canvas,
      30,
      (seconds) => {
        const elapsed = lastSeconds === null ? 0 : Math.min(1 / 30, seconds - lastSeconds)
        lastSeconds = seconds

        if (sand.step(elapsed)) setView(sand.view())
        scene.draw(sand)
      },
      "0px 0px -35% 0px",
    )

    return () => {
      stop()
      simulation.current = null
    }
  }, [])
  const canvas = usePixelCanvas(4, start)

  const isFull = view.phase === "full"
  const limit = SandSimulation.limits[view.plan]

  function handlePointerDown() {
    if (view.canUpgrade) simulation.current?.upgrade()
    else simulation.current?.hold()
  }

  function handleKeyboardClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail !== 0) return

    if (view.canUpgrade) simulation.current?.upgrade()
    else simulation.current?.send()
  }

  return (
    <div className={`glass ${styles.panel}`} data-phase={view.phase}>
      <canvas ref={canvas} className={styles.sand} />
      <div className={styles.controls}>
        <p className={styles.status}>
          <b>{planNames[view.plan]}</b>
          {view.phase === "renewed" && " · renovado"}
          {` · ${view.usage.toLocaleString("pt-BR")} / ${limit.toLocaleString("pt-BR")}`}
          {isFull && " · limite atingido"}
        </p>
        <button
          type="button"
          className={styles.button}
          data-upgrade={view.canUpgrade}
          disabled={view.isBusy}
          onPointerDown={handlePointerDown}
          onPointerUp={() => simulation.current?.release()}
          onPointerLeave={() => simulation.current?.release()}
          onPointerCancel={() => simulation.current?.release()}
          onClick={handleKeyboardClick}
        >
          {view.canUpgrade ? "Assinar Pro" : "Enviar mensagem"}
        </button>
      </div>
    </div>
  )
}
