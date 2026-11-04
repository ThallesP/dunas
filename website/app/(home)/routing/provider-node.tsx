import type { Ref } from "react"
import styles from "./routing.module.css"

export type ProviderNodeProps = {
  ref: Ref<HTMLDivElement>
  name: string
  count: number
  isDown?: boolean
}

export function ProviderNode({ ref, name, count, isDown = false }: ProviderNodeProps) {
  return (
    <div ref={ref} className={`${styles.node} ${styles.providerNode} ${isDown ? styles.down : ""}`}>
      {count > 0 && <span key={count} className={styles.flash} aria-hidden="true" />}
      <span className={styles.icon}>
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
          <rect
            x=".75"
            y=".75"
            width="16.5"
            height="12.5"
            rx="2.5"
            stroke="#AEBBD6"
            strokeWidth="1.5"
          />
          <path d="M1 4.5h16" stroke="#AEBBD6" strokeWidth="2" />
        </svg>
      </span>
      <div>
        <div className={styles.name}>{name}</div>
        <div className={styles.status}>
          <span className={styles.dot} />
          {isDown ? "indisponível" : "disponível"}
        </div>
      </div>
      <div className={styles.count}>
        <b className={styles.countValue}>{count}</b>
        <small className={styles.countLabel}>cobranças</small>
      </div>
    </div>
  )
}
