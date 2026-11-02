import { BrandMark } from "@/components/brand/brand-mark"
import { links } from "@/lib/links"
import styles from "./footer.module.css"

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`wrap ${styles.row}`}>
        <a className={styles.brand} href="/">
          <BrandMark accent="#C98B4E" />
          dunas
        </a>
        <nav className={styles.links}>
          <a href={links.docs}>Documentação</a>
          <a href={links.examples}>Exemplos</a>
          <a href={links.github}>GitHub</a>
          <a href={links.npm}>npm</a>
        </nav>
      </div>
    </footer>
  )
}
