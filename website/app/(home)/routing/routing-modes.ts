export type ProviderSlot = "first" | "second"

export type RoutingMode = "failover" | "round-robin" | "weights" | "rule"

export type RoutingModeCopy = {
  label: string
  config: string
  caption: string
  durationInSeconds: number
  next: RoutingMode
}

export const routingModes: Record<RoutingMode, RoutingModeCopy> = {
  failover: {
    label: "Failover",
    config: 'routing: "failover"',
    caption: "Tudo vai para o primeiro. Se ele cair, o próximo assume.",
    durationInSeconds: 5.2,
    next: "round-robin",
  },
  "round-robin": {
    label: "Revezamento",
    config: 'routing: "round-robin"',
    caption: "Uma cobrança em cada provedor, alternando.",
    durationInSeconds: 4.2,
    next: "weights",
  },
  weights: {
    label: "Por peso",
    config: "routing: { weights: { provedor1: 70, provedor2: 30 } }",
    caption: "Divida as cobranças por porcentagem.",
    durationInSeconds: 4.4,
    next: "rule",
  },
  rule: {
    label: "Sua regra",
    config: 'routing: ({ amountInCents }) => amountInCents > 50_000 ? "provedor2" : "provedor1"',
    caption: "Uma função escolhe o provedor de cada cobrança, pelo valor ou pelo cliente.",
    durationInSeconds: 4.6,
    next: "failover",
  },
}

export const routingModeOrder: RoutingMode[] = ["failover", "round-robin", "weights", "rule"]
