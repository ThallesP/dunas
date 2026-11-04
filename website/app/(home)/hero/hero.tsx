import { AgentLogos } from "@/components/agent-logos/agent-logos"
import { CopyButton } from "@/components/copy-button/copy-button"
import { agentPrompt } from "@/lib/agent-prompt"
import { links } from "@/lib/links"
import { Nav } from "../nav/nav"
import styles from "./hero.module.css"
import { HeroScene } from "./hero-scene"

export function Hero() {
  return (
    <section className={styles.hero}>
      <HeroScene />
      <Nav />
      <div className={`wrap ${styles.content}`}>
        <h1 className={styles.title}>Se um provedor cair, você continua vendendo.</h1>
        <p className={`lede ${styles.lede}`}>
          Planos, assinaturas e limites de uso numa biblioteca só, ligada a mais de um provedor de
          pagamento. Se um sai do ar, bloqueia sua conta ou sobe a taxa, a cobrança passa pelo
          outro.
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
    </section>
  )
}
