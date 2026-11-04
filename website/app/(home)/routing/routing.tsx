import styles from "./routing.module.css"
import { RoutingPanel } from "./routing-panel"

export function Routing() {
  return (
    <section className={styles.routing}>
      <div className="wrap">
        <h2 className="display">Vários provedores. Um código só.</h2>
        <p className={`lede ${styles.lede}`}>
          Você conecta seus provedores uma vez e escolhe como as cobranças se dividem. Seu app não
          muda uma linha.
        </p>
        <RoutingPanel />
      </div>
    </section>
  )
}
