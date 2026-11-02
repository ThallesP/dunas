import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          exclude: ["test/e2e/**"],
          testTimeout: 15_000,
        },
      },
      { test: { name: "e2e", include: ["test/e2e/**/*.test.ts"], testTimeout: 60_000 } },
    ],
  },
})
