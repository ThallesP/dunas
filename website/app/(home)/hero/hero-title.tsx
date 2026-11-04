"use client"

import { useEffect, useState } from "react"
import { ShuffleIcon } from "@/components/icons/shuffle-icon"
import { prefersReducedMotion } from "@/lib/dither"
import styles from "./hero.module.css"

const reasons = ["cair", "bloquear sua conta", "segurar seu dinheiro", "subir a taxa"]

export function HeroTitle() {
  const [swapCount, setSwapCount] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const activeIndex = swapCount % reasons.length
  const hasSwapped = swapCount > 0

  useEffect(() => {
    if (isPaused || prefersReducedMotion()) return
    const timer = setTimeout(() => setSwapCount(swapCount + 1), 2_400)
    return () => clearTimeout(timer)
  }, [isPaused, swapCount])

  function handleSwap() {
    setSwapCount((count) => count + 1)
  }

  return (
    <h1
      className={styles.title}
      onPointerEnter={() => setIsPaused(true)}
      onPointerLeave={() => setIsPaused(false)}
    >
      {reasons.map((reason, index) => (
        <span
          key={reason}
          className={`${styles.titleLayer} ${index === activeIndex ? styles.activeLayer : ""}`}
        >
          Se um provedor{" "}
          <button type="button" onClick={handleSwap} title="Trocar" className={styles.swap}>
            <span className={`${styles.word} ${hasSwapped ? styles.swapped : ""}`}>{reason}</span>
            <span className={styles.swapIcon}>
              <ShuffleIcon size="100%" />
            </span>
            <span className={styles.comma}>,</span>
          </button>
          <br />
          você continua vendendo.
        </span>
      ))}
    </h1>
  )
}
