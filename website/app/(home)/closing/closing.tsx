import Image from "next/image"
import { AgentLogos } from "@/components/agent-logos/agent-logos"
import { CopyButton } from "@/components/copy-button/copy-button"
import { GitHubIcon } from "@/components/icons/github-icon"
import { agentPrompt } from "@/lib/agent-prompt"
import { integrations } from "@/lib/integrations"
import { links } from "@/lib/links"
import styles from "./closing.module.css"
import { Dawn } from "./dawn"

export function Closing() {
  return (
    <section className={styles.closing}>
      <Dawn className={styles.dawn} />
      <div className={`wrap ${styles.inner}`}>
        <h2 className="display">
          Roda no seu app.
          <br />É seu.
        </h2>
        <p className={`lede ${styles.lede}`}>Código aberto, licença MIT. Inspirado no paykit.</p>
        <CopyButton
          text={agentPrompt}
          iconSize={30}
          className={`glass ${styles.command}`}
          iconClassName={styles.commandIcon}
        >
          <AgentLogos className={styles.agents} />
          <span className={styles.commandText}>
            <span className={styles.commandLead}>
              Adicione cobrança com a biblioteca dunas a este app:
            </span>
            dunasjs.dev/SKILL.md
          </span>
        </CopyButton>
        <div className={styles.ctas}>
          <a className="btn btn-ghost" href={links.docs}>
            Ler a documentação
          </a>
          <a className="btn btn-ghost" href={links.github}>
            <GitHubIcon />
            GitHub
          </a>
        </div>
        <p className={styles.works}>Funciona com o que você já usa</p>
        <ul className={styles.grid}>
          {integrations.map((integration) => (
            <li key={integration.name} className={styles.logo}>
              <Image src={integration.logo} alt="" width={22} height={22} />
              {integration.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
