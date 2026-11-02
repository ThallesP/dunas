import Image from "next/image"
import { Code } from "@/components/code/code"
import { featuredProvider } from "@/lib/featured-provider"
import styles from "./details.module.css"
import { DetailsTabs } from "./details-tabs"
import { FrameworkSwitch } from "./framework-switch"
import { PaymentPane } from "./payment-pane"
import { PlansPane } from "./plans-pane"
import { RetryPane } from "./retry-pane"
import {
  checkSnippet,
  eventsSnippet,
  honoSnippet,
  nestSnippet,
  nextSnippet,
  typedIdSnippet,
} from "./snippets"

export function Details() {
  const typoStart = typedIdSnippet.indexOf('"pr0"')

  return (
    <section className={styles.details}>
      <div className="wrap">
        <div className={styles.intro}>
          <h2 className="display">O resto, já resolvido.</h2>
          <p className={`lede ${styles.lede}`}>
            Tudo o que dá trabalho em cobrança recorrente, dentro da biblioteca.
          </p>
        </div>
        <DetailsTabs
          items={[
            {
              title: "O seu Postgres",
              description:
                "Os direitos de cada cliente ficam no seu banco. Checar um limite é uma query local.",
              pane: (
                <div className={styles.col}>
                  <Code code={checkSnippet} className={styles.snip} />
                  <p className={styles.database}>
                    <Image src="/logos/postgres.svg" alt="" width={16} height={16} />
                    Postgres ou PGlite
                  </p>
                </div>
              ),
            },
            {
              title: "Ids tipados",
              description: "Errou o nome de um plano? Não compila.",
              pane: (
                <div className={styles.col}>
                  <Code
                    code={typedIdSnippet}
                    decorations={[
                      {
                        start: typoStart,
                        end: typoStart + 5,
                        properties: { class: styles.squiggle },
                      },
                    ]}
                    className={styles.snip}
                  />
                  <p className={styles.tip}>
                    <b>error</b> Type '"pr0"' is not assignable to type '"free" | "pro"'.
                  </p>
                </div>
              ),
            },
            {
              title: "Preços sem lógica de billing",
              description: "A lista de planos já diz o que cada botão faz.",
              pane: (
                <div className={styles.col}>
                  <PlansPane />
                </div>
              ),
            },
            {
              title: "O pagamento cai, a tela muda",
              description: "O navegador sabe na hora em que a cobrança é paga.",
              pane: (
                <div className={styles.col}>
                  <PaymentPane />
                </div>
              ),
            },
            {
              title: "Uma rota para tudo",
              description:
                "Cliente, webhooks e renovação no mesmo handler. Next.js, NestJS, Hono, Bun ou Deno.",
              pane: (
                <div className={`${styles.col} ${styles.wide}`}>
                  <FrameworkSwitch
                    defaultFramework="NestJS"
                    frameworks={[
                      {
                        name: "Next.js",
                        code: (
                          <Code code={nextSnippet} className={`${styles.snip} ${styles.small}`} />
                        ),
                      },
                      {
                        name: "NestJS",
                        code: (
                          <Code code={nestSnippet} className={`${styles.snip} ${styles.small}`} />
                        ),
                      },
                      {
                        name: "Hono",
                        code: (
                          <Code code={honoSnippet} className={`${styles.snip} ${styles.small}`} />
                        ),
                      },
                    ]}
                  />
                  <ul className={styles.chips}>
                    <li>Cliente do navegador</li>
                    <li>Webhook {featuredProvider.name}</li>
                    <li>Cron de renovação</li>
                  </ul>
                </div>
              ),
            },
            {
              title: "Conta uma vez",
              description: "Um retry não conta o uso duas vezes.",
              pane: (
                <div className={styles.col}>
                  <RetryPane />
                </div>
              ),
            },
            {
              title: "Eventos no seu código",
              description: "Reaja a cobranças e assinaturas com funções comuns.",
              pane: (
                <div className={`${styles.col} ${styles.wide}`}>
                  <Code code={eventsSnippet} className={`${styles.snip} ${styles.small}`} />
                  <ul className={`${styles.chips} ${styles.monoChips}`}>
                    <li>charge.created</li>
                    <li>subscription.activated</li>
                    <li>subscription.renewed</li>
                    <li>subscription.past_due</li>
                    <li>subscription.canceled</li>
                  </ul>
                </div>
              ),
            },
          ]}
        />
      </div>
    </section>
  )
}
