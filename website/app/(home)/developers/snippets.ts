import { featuredProvider } from "@/lib/featured-provider"

const setupImports = ["createDunas", "pg", featuredProvider.id].sort().join(", ")

export const setupSnippet = `import { ${setupImports} } from "dunasjs"
import { free, pro } from "./plans"

export const billing = createDunas({
  database: pg(pool),
  plans: [free, pro],
  providers: [
    ${featuredProvider.setup},
  ],
  routing: "failover",
})`
