import { Code } from "@/components/code/code"
import styles from "./developers.module.css"
import { setupSnippet } from "./snippets"

const features = [
  "Planos, assinaturas e limites de uso",
  "Renovação mensal e avisos de cobrança",
  "Webhooks de todos os provedores num handler só",
  "Seus dados no seu Postgres",
  "Código aberto, licença MIT",
]

export function Developers() {
  return (
    <section className={styles.developers}>
      <div className={`wrap ${styles.inner}`}>
        <div>
          <h2 className={styles.title}>E para quem programa, o resto já vem pronto.</h2>
          <ol className={styles.list}>
            {features.map((feature, index) => (
              <li key={feature} className={styles.item}>
                <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
                {feature}
              </li>
            ))}
          </ol>
        </div>
        <div className={`glass ${styles.window}`}>
          <div className={styles.bar}>dunas.ts</div>
          <Code code={setupSnippet} className={styles.code} />
        </div>
      </div>
    </section>
  )
}
