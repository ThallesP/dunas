"use client"

import { type ReactNode, useState } from "react"
import styles from "./hero.module.css"

export type HeroCodeProps = {
  files: { name: string; code: ReactNode }[]
  className?: string
}

export function HeroCode({ files, className }: HeroCodeProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <div className={className}>
      <div className={styles.tabs} role="tablist">
        {files.map((file, index) => (
          <button
            key={file.name}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            className={styles.tab}
            onClick={() => setActiveIndex(index)}
          >
            {file.name}
          </button>
        ))}
      </div>
      <div className={styles.panes}>
        {files.map((file, index) => (
          <div
            key={file.name}
            role="tabpanel"
            className={styles.pane}
            inert={index !== activeIndex}
          >
            {file.code}
          </div>
        ))}
      </div>
    </div>
  )
}
