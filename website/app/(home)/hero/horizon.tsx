import Image from "next/image"
import { RoutingPanel } from "../routing/routing-panel"
import { BlownSand } from "./blown-sand"
import styles from "./hero.module.css"

export function Horizon() {
  return (
    <div className={styles.horizon}>
      <div className={styles.horizonArt}>
        <Image
          className={styles.dunes}
          src="/art/dunes-night.png"
          alt="Dunas dos Lençóis Maranhenses à noite, em pontilhado"
          width={480}
          height={270}
          preload
        />
        <BlownSand src="/art/dunes-night.png" className={styles.dunes} />
      </div>
      <div className={`wrap ${styles.panelWrap}`}>
        <RoutingPanel />
      </div>
    </div>
  )
}
