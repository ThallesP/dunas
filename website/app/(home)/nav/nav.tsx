import { BrandMark } from "@/components/brand/brand-mark"
import { GitHubIcon } from "@/components/icons/github-icon"
import { links } from "@/lib/links"
import styles from "./nav.module.css"

export function Nav() {
  return (
    <nav className={`wrap ${styles.nav}`}>
      <a className={styles.brand} href="/">
        <BrandMark />
        dunas
      </a>
      <ul className={styles.links}>
        <li>
          <a href={links.docs}>Documentação</a>
        </li>
        <li>
          <a href={links.examples}>Exemplos</a>
        </li>
      </ul>
      <div className={styles.right}>
        <a className={styles.github} href={links.github} aria-label="GitHub">
          <GitHubIcon />
          <span>GitHub</span>
        </a>
        <a className={`btn btn-light ${styles.start}`} href={links.docs}>
          Começar
        </a>
      </div>
    </nav>
  )
}
