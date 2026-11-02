import type { ReactNode } from "react"
import { Code } from "@/components/code/code"
import { featuredProvider } from "@/lib/featured-provider"
import { consumeSnippet, plansSnippet, subscribeSnippet } from "./snippets"
import styles from "./steps.module.css"

const steps: {
  number: string
  title: string
  description: string
  file: string
  code: string
  result: ReactNode
}[] = [
  {
    number: "01",
    title: "Defina os planos",
    description:
      "Features, limites e preços ficam num arquivo do seu repositório. Cada id vira tipo.",
    file: "billing/plans.ts",
    code: plansSnippet,
    result: (
      <div className={styles.result}>
        <span className={styles.arrow}>→</span>
        <span>
          planId: <span className={styles.string}>"free"</span> |{" "}
          <span className={styles.string}>"pro"</span>
        </span>
      </div>
    ),
  },
  {
    number: "02",
    title: "Assine",
    description:
      "O cliente assina e recebe a cobrança do gateway escolhido. O navegador espera o pagamento, e todo mês a renovação acontece sozinha.",
    file: "app/assinar/page.tsx",
    code: subscribeSnippet,
    result: (
      <div className={styles.result}>
        <span className={styles.arrow}>→</span>
        <span>
          {"{"} status: <span className={styles.string}>"paid"</span>, provider:{" "}
          <span className={styles.string}>"{featuredProvider.id}"</span> {"}"}
        </span>
      </div>
    ),
  },
  {
    number: "03",
    title: "Limite o uso",
    description:
      "Cada uso passa pelo limite do plano antes de ser registrado. A checagem é uma query no seu Postgres.",
    file: "app/api/chat/route.ts",
    code: consumeSnippet,
    result: (
      <div className={styles.result}>
        <span className={styles.status}>402</span>
        <span className={styles.muted}>Limite do plano atingido</span>
      </div>
    ),
  },
]

export function Steps() {
  return (
    <section className={`wrap ${styles.steps}`}>
      <h2 className={`display ${styles.title}`}>Do plano à cobrança em três chamadas.</h2>
      <p className={`lede ${styles.lede}`}>
        Defina os planos em TypeScript, assine e limite o uso na rota. Webhooks, cron e renovação
        rodam dentro do dunas.
      </p>
      <ol className={styles.list}>
        {steps.map((step) => (
          <li key={step.number} className={styles.step}>
            <div>
              <div className={styles.number}>{step.number}</div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.description}>{step.description}</p>
            </div>
            <div className={styles.window}>
              <div className={styles.file}>{step.file}</div>
              <Code code={step.code} className={styles.code} />
              {step.result}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
