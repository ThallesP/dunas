"use client"

import { useState } from "react"
import { ShuffleIcon } from "@/components/icons/shuffle-icon"
import styles from "./hero.module.css"

const reasons = ["cair", "bloquear sua conta", "segurar seu dinheiro", "subir a taxa"]

export function HeroTitle() {
  const [swapCount, setSwapCount] = useState(0)
  const activeIndex = swapCount % reasons.length
  const hasSwapped = swapCount > 0

  function handleSwap() {
    setSwapCount((count) => count + 1)
  }

  return (
    <h1 className={styles.title}>
      {reasons.map((reason, index) => (
        <span
          key={reason}
          className={`${styles.titleLayer} ${index === activeIndex ? styles.activeLayer : ""}`}
        >
          Se um provedor{" "}
          <button type="button" onClick={handleSwap} title="Trocar" className={styles.swap}>
            <span className={`${styles.word} ${hasSwapped ? styles.swapped : ""}`}>{reason}</span>,
            <span className={styles.swapIcon}>
              <ShuffleIcon size="100%" />
            </span>
          </button>
          <br />
          você continua vendendo.
        </span>
      ))}
    </h1>
  )
}
