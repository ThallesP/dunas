export const providers = {
  woovi: {
    id: "woovi",
    name: "Woovi",
    logo: "/logos/woovi-mono.png",
    setup: "woovi({ appId: env.WOOVI_APP_ID })",
  },
  abacatepay: {
    id: "abacatepay",
    name: "AbacatePay",
    logo: "/logos/abacatepay-mono.png",
    setup: `abacatepay({
      apiKey: env.ABACATEPAY_API_KEY,
      webhookSecret: env.ABACATEPAY_WEBHOOK_SECRET,
    })`,
  },
}

// The landing page names one provider at a time. Switch it when pitching the other one.
export const featuredProvider = providers.abacatepay
