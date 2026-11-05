import Image from "next/image"
import type { Ref } from "react"
import styles from "./routing.module.css"

export type ProviderNodeProps = {
  ref: Ref<HTMLDivElement>
  name: string
  logo: string
  count: number
  isDown?: boolean
}

export function ProviderNode({ ref, name, logo, count, isDown = false }: ProviderNodeProps) {
  return (
    <div ref={ref} className={`${styles.node} ${styles.providerNode} ${isDown ? styles.down : ""}`}>
      {count > 0 && <span key={count} className={styles.flash} aria-hidden="true" />}
      <Image className={styles.logo} src={logo} alt="" width={24} height={24} />
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
