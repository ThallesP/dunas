import { defineConfig } from "tsdown"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig({
  entry: Object.fromEntries(
    Object.entries(packageJson.exports).map(([subpath, source]) => [
      subpath === "." ? "index" : subpath.slice(2),
      source,
    ]),
  ),
  dts: true,
})
