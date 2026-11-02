import { describe, expect, it } from "vitest"
import { fromBetterAuth } from "../src/integrations/better-auth.ts"

describe("fromBetterAuth", () => {
  it("maps the session user to a customer and ignores anonymous requests", async () => {
    const identify = fromBetterAuth({
      api: {
        getSession: async ({ headers }) =>
          headers.get("cookie") ? { user: { id: "user_1", name: "Ana", email: null } } : null,
      },
    })

    expect(
      await identify(new Request("http://localhost", { headers: { cookie: "session=1" } })),
    ).toEqual({
      id: "user_1",
      name: "Ana",
      email: undefined,
    })
    expect(await identify(new Request("http://localhost"))).toBeNull()
  })
})
