import Image from "next/image"
import { BlownSand } from "./blown-sand"
import styles from "./hero.module.css"
import { Stars } from "./stars"

export function HeroScene() {
  return (
    <div className={styles.scene}>
      <Image
        className={styles.dunes}
        src="/art/dunes-night.png"
        alt="Dunas dos Lençóis Maranhenses à noite, em pontilhado"
        width={480}
        height={270}
        preload
      />
      <BlownSand src="/art/dunes-night.png" className={styles.dunes} />
      <Stars className={styles.stars} />
    </div>
  )
}
