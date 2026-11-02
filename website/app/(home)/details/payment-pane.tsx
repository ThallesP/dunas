import { CheckIcon } from "@/components/icons/check-icon"
import styles from "./details.module.css"

export function PaymentPane() {
  return (
    <div className={styles.payments}>
      <div className={`${styles.payment} ${styles.waiting}`}>
        <span className={styles.spinner} aria-hidden="true" />
        Aguardando pagamento
        <span className={styles.paymentState}>pending_payment</span>
      </div>
      <div className={`${styles.payment} ${styles.paid}`}>
        <span className={styles.check}>
          <CheckIcon size={12} />
        </span>
        Pago · R$ 49,90
        <span className={styles.paymentState}>active</span>
      </div>
    </div>
  )
}
