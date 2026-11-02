import styles from "./details.module.css"

export function RetryPane() {
  return (
    <div className={styles.retries}>
      <div className={styles.retry}>
        <em>consume</em>msg_81f2<b>+1</b>
      </div>
      <div className={`${styles.retry} ${styles.duplicate}`}>
        <em>retry</em>msg_81f2<b>já contado</b>
      </div>
      <div className={`${styles.retry} ${styles.duplicate}`}>
        <em>retry</em>msg_81f2<b>já contado</b>
      </div>
    </div>
  )
}
