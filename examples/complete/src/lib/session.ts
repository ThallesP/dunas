import { getCookie, setCookie } from "@tanstack/react-start/server"

const cookieName = "agendai_user"

export function currentUser() {
  const id = getCookie(cookieName)
  if (id) {
    return userFor(id)
  }

  const newId = `barbearia-${crypto.randomUUID().slice(0, 8)}`
  setCookie(cookieName, newId, { path: "/", httpOnly: true, sameSite: "lax" })
  return userFor(newId)
}

export function userFromRequest(request: Request) {
  const id = request.headers.get("cookie")?.match(new RegExp(`${cookieName}=([\\w-]+)`))?.[1]
  return id ? userFor(id) : null
}

function userFor(id: string) {
  return {
    id,
    name: "Barbearia do Zé",
    email: "ze@barbeariadoze.com.br",
    taxId: "52998224725",
  }
}
