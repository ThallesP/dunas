import { providers } from "@/lib/providers"

export const setupSnippet = `import { abacatepay, createDunas, pg, woovi } from "dunasjs"
import { free, pro } from "./plans"

export const billing = createDunas({
  database: pg(pool),
  plans: [free, pro],
  providers: [
    ${providers.woovi.setup},
    ${providers.abacatepay.setup},
  ],
  routing: "failover",
})`
