"use client"

import { useState } from "react"
import { ShuffleIcon } from "@/components/icons/shuffle-icon"
import styles from "./hero.module.css"
import { saasNames } from "./saas-names"

const labels = ["SaaS", ...saasNames]

export function ShuffleSaas() {
  const [shuffleCount, setShuffleCount] = useState(0)
  const label = labels[shuffleCount % labels.length]
  const hasShuffled = shuffleCount > 0

  function handleShuffle() {
    setShuffleCount((count) => count + 1)
  }

  return (
    <button
      type="button"
      onClick={handleShuffle}
      title="Trocar por um SaaS brasileiro"
      className={styles.shuffle}
    >
      <span aria-live="polite">
        <span key={shuffleCount} className={hasShuffled ? styles.shuffled : undefined}>
          {label}
        </span>
      </span>
      <span className={styles.shuffleIcon}>
        <ShuffleIcon size="100%" />
      </span>
    </button>
  )
}
