"use client"

import { type ReactNode, useState } from "react"
import styles from "./details.module.css"

export type Framework = {
  name: string
  code: ReactNode
}

export type FrameworkSwitchProps = {
  frameworks: Framework[]
  defaultFramework: string
}

export function FrameworkSwitch({ frameworks, defaultFramework }: FrameworkSwitchProps) {
  const [selectedFramework, setSelectedFramework] = useState(defaultFramework)

  return (
    <>
      <div className={styles.frameworks}>
        {frameworks.map((framework) => {
          const isSelected = framework.name === selectedFramework

          return (
            <button
              key={framework.name}
              type="button"
              aria-pressed={isSelected}
              className={
                isSelected ? `${styles.framework} ${styles.frameworkActive}` : styles.framework
              }
              onClick={() => setSelectedFramework(framework.name)}
            >
              {framework.name}
            </button>
          )
        })}
      </div>
      {frameworks.map((framework) => (
        <div key={framework.name} hidden={framework.name !== selectedFramework}>
          {framework.code}
        </div>
      ))}
    </>
  )
}
