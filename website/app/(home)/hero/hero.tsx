import { AgentLogos } from "@/components/agent-logos/agent-logos"
import { Code } from "@/components/code/code"
import { CopyButton } from "@/components/copy-button/copy-button"
import { agentPrompt } from "@/lib/agent-prompt"
import { links } from "@/lib/links"
import { Nav } from "../nav/nav"
import styles from "./hero.module.css"
import { HeroCode } from "./hero-code"
import { HeroScene } from "./hero-scene"
import { ShuffleSaas } from "./shuffle-saas"
import { plansSnippet, routeSnippet, setupSnippet } from "./snippets"

export function Hero() {
  return (
    <section className={styles.hero}>
      <HeroScene />
      <Nav />
      <div className={`wrap ${styles.content}`}>
        <div>
          <h1 className={styles.title}>
            O billing do seu <ShuffleSaas /> em uma biblioteca.
          </h1>
          <p className={`lede ${styles.lede}`}>
            Defina planos, assinaturas e limites em TypeScript. O dunas cuida das cobranças,
            renovações e webhooks.
          </p>
          <div className={styles.ctas}>
            <a className="btn btn-light" href={links.docs}>
              Começar
            </a>
            <CopyButton
              text={agentPrompt}
              iconSize={15}
              className={styles.chip}
              iconClassName={styles.chipIcon}
            >
              <AgentLogos className={styles.agents} />
              <span>Copiar prompt para o seu agente</span>
            </CopyButton>
          </div>
        </div>
        <HeroCode
          className={`glass ${styles.window}`}
          files={[
            { name: "dunas.ts", code: <Code code={setupSnippet} className={styles.code} /> },
            { name: "plans.ts", code: <Code code={plansSnippet} className={styles.code} /> },
            { name: "route.ts", code: <Code code={routeSnippet} className={styles.code} /> },
          ]}
        />
      </div>
    </section>
  )
}
