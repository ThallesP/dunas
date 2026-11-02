import styles from "./details.module.css"

export function PlansPane() {
  return (
    <div className={styles.plans}>
      <div className={styles.planCard}>
        <div className={styles.planName}>Free</div>
        <div className={styles.planPrice}>R$ 0</div>
        <div className={styles.planButton}>Plano atual</div>
        <div className={styles.planAction}>current</div>
      </div>
      <div className={styles.planCard}>
        <div className={styles.planName}>Pro</div>
        <div className={styles.planPrice}>
          R$ 49,90<span>/mês</span>
        </div>
        <div className={`${styles.planButton} ${styles.planButtonPrimary}`}>Assinar</div>
        <div className={styles.planAction}>upgrade</div>
      </div>
    </div>
  )
}
