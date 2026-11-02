const alphabet = "0123456789abcdefghjkmnpqrstvwxyz"

export function createId(prefix: "sub" | "chg" | "evt" | "use") {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const suffix = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("")
  return `${prefix}_${suffix}`
}
