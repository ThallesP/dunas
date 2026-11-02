import type { Identify } from "../http/handler.ts"

type BetterAuthLike = {
  api: {
    getSession(input: { headers: Headers }): Promise<{
      user: { id: string; name?: string | null; email?: string | null }
    } | null>
  }
}

export function fromBetterAuth(auth: BetterAuthLike): Identify {
  return async (request) => {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) {
      return null
    }

    const { id, name, email } = session.user
    return { id, name: name ?? undefined, email: email ?? undefined }
  }
}
