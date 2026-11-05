import styles from "./hero.module.css"
import { Stars } from "./stars"

export function HeroScene() {
  return (
    <div className={styles.scene}>
      <Stars className={styles.stars} />
    </div>
  )
}
