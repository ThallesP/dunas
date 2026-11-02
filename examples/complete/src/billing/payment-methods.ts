import type { PaymentMethod } from "dunas"

export const paymentMethodDetails: Record<PaymentMethod, { label: string; description: string }> = {
  pix_automatico: {
    label: "Pix Automático",
    description: "Autorize uma vez no app do banco. Todo mês o valor sai sozinho.",
  },
  card: {
    label: "Cartão de crédito",
    description: "Cobrado todo mês no cartão.",
  },
  pix: {
    label: "Pix todo mês",
    description: "Pague agora com o QR code. A cada mês você recebe um Pix novo.",
  },
}
