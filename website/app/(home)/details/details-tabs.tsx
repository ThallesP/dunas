"use client"

import { type ReactNode, useId, useState } from "react"
import styles from "./details.module.css"
import { DitherGlow } from "./dither-glow"

export type DetailItem = {
  title: string
  description: string
  pane: ReactNode
}

export type DetailsTabsProps = {
  items: DetailItem[]
}

export function DetailsTabs({ items }: DetailsTabsProps) {
  const id = useId()
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <div className={styles.tabs}>
      <div className={styles.list} role="tablist" aria-orientation="vertical">
        {items.map((item, index) => {
          const isActive = index === activeIndex

          return (
            <button
              key={item.title}
              type="button"
              role="tab"
              id={`${id}-tab-${index}`}
              aria-selected={isActive}
              aria-controls={`${id}-pane-${index}`}
              className={isActive ? `${styles.item} ${styles.itemActive}` : styles.item}
              onClick={() => setActiveIndex(index)}
            >
              {isActive && (
                <span
                  className={styles.bar}
                  onAnimationEnd={() => setActiveIndex((index + 1) % items.length)}
                />
              )}
              <span className={styles.itemTitle}>{item.title}</span>
              <span className={styles.itemText}>{item.description}</span>
            </button>
          )
        })}
      </div>
      <div className={`glass ${styles.panel}`}>
        <DitherGlow />
        {items.map((item, index) => {
          const isActive = index === activeIndex

          return (
            <div
              key={item.title}
              role="tabpanel"
              id={`${id}-pane-${index}`}
              aria-labelledby={`${id}-tab-${index}`}
              inert={!isActive}
              className={isActive ? `${styles.pane} ${styles.paneActive}` : styles.pane}
            >
              {item.pane}
            </div>
          )
        })}
      </div>
    </div>
  )
}
