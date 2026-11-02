import { SandPanel } from "./sand-panel"
import styles from "./usage.module.css"

export function Usage() {
  return (
    <section className={styles.usage}>
      <div className="wrap">
        <h2 className="display">Cada uso conta. O limite é seu.</h2>
        <p className={`lede ${styles.lede}`}>
          O dunas mede cada uso contra o plano do cliente, cobra a assinatura e zera tudo na
          renovação.
        </p>
        <SandPanel />
      </div>
    </section>
  )
}
