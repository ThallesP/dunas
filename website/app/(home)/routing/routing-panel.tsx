"use client"

import { useCallback, useRef, useState } from "react"
import { BrandMark } from "@/components/brand/brand-mark"
import { type PixelCanvas, usePixelCanvas } from "@/hooks/use-pixel-canvas"
import { animate, prefersReducedMotion } from "@/lib/dither"
import { FlowScene } from "./flow-scene"
import { FlowSimulation } from "./flow-simulation"
import { ProviderNode } from "./provider-node"
import styles from "./routing.module.css"
import { type RoutingMode, routingModeOrder, routingModes } from "./routing-modes"

export function RoutingPanel() {
  const [simulation] = useState(() => new FlowSimulation())
  const [view, setView] = useState(() => simulation.view())
  const scene = useRef<FlowScene>(null)
  const isPointerInside = useRef(false)
  const app = useRef<HTMLDivElement>(null)
  const dunas = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLDivElement>(null)
  const second = useRef<HTMLDivElement>(null)

  const start = useCallback(
    (pixels: PixelCanvas) => {
      if (!app.current || !dunas.current || !first.current || !second.current) {
        return () => {}
      }

      const flow = new FlowScene(pixels, {
        app: app.current.getBoundingClientRect(),
        dunas: dunas.current.getBoundingClientRect(),
        first: first.current.getBoundingClientRect(),
        second: second.current.getBoundingClientRect(),
      })
      scene.current = flow

      let lastSeconds: number | null = null
      const stop = animate(
        pixels.canvas,
        24,
        (seconds) => {
          const elapsed = lastSeconds === null ? 0 : Math.min(0.1, seconds - lastSeconds)
          lastSeconds = seconds

          let hasChanged = simulation.step(elapsed)
          if (simulation.isFinished && !isPointerInside.current) {
            simulation.reset(routingModes[simulation.mode].next, false)
            hasChanged = true
          }
          if (hasChanged) setView(simulation.view())
          flow.draw(simulation)
        },
        "0px 0px -35% 0px",
      )

      return () => {
        stop()
        scene.current = null
      }
    },
    [simulation],
  )
  const canvas = usePixelCanvas(3, start)

  const { config, caption } = routingModes[view.mode]
  const fadeClass = view.run > 0 ? styles.fadeIn : ""

  function handleSelect(mode: RoutingMode) {
    simulation.reset(mode, prefersReducedMotion())
    setView(simulation.view())
    scene.current?.draw(simulation)
  }

  return (
    <div
      className={`glass ${styles.panel}`}
      onPointerEnter={() => {
        isPointerInside.current = true
      }}
      onPointerLeave={() => {
        isPointerInside.current = false
      }}
    >
      <canvas ref={canvas} className={styles.flow} />
      <div className={styles.top}>
        <fieldset className={styles.segments} aria-label="Modo de roteamento">
          {routingModeOrder.map((mode) => (
            <button
              key={mode}
              type="button"
              className={styles.segment}
              aria-pressed={mode === view.mode}
              onClick={() => handleSelect(mode)}
            >
              {routingModes[mode].label}
            </button>
          ))}
        </fieldset>
        <code key={view.run} className={`${styles.config} ${fadeClass}`}>
          {config}
        </code>
      </div>
      <div className={styles.diagram}>
        <div ref={app} className={`${styles.node} ${styles.app}`}>
          <span className={styles.icon}>
            <svg width="18" height="16" viewBox="0 0 18 16" fill="none" aria-hidden="true">
              <rect
                x=".75"
                y=".75"
                width="16.5"
                height="14.5"
                rx="3"
                stroke="#AEBBD6"
                strokeWidth="1.5"
              />
              <path d="M1 5h16" stroke="#AEBBD6" strokeWidth="1.5" />
              <circle cx="4" cy="3" r=".9" fill="#AEBBD6" />
              <circle cx="6.6" cy="3" r=".9" fill="#AEBBD6" />
            </svg>
          </span>
          <div>
            <div className={styles.name}>Seu app</div>
            <div className={styles.status}>cria cobranças</div>
          </div>
        </div>
        <div ref={dunas} className={`${styles.node} ${styles.dunas}`}>
          <span className={styles.icon}>
            <BrandMark />
          </span>
          <div>
            <div className={styles.name}>dunas</div>
            <div className={styles.status}>escolhe o caminho</div>
          </div>
        </div>
        <div className={styles.providers}>
          <ProviderNode
            ref={first}
            name="Provedor 1"
            count={view.counts.first}
            isDown={view.isFirstDown}
          />
          <ProviderNode ref={second} name="Provedor 2" count={view.counts.second} />
        </div>
      </div>
      <p key={view.run} className={`${styles.caption} ${fadeClass}`}>
        {caption}
      </p>
    </div>
  )
}
