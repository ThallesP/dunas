import type { IncomingHttpHeaders, IncomingMessage } from "node:http"
import { TLSSocket } from "node:tls"

export type NodeRequest = IncomingMessage & {
  originalUrl?: string
  rawBody?: Buffer
  body?: unknown
}

export function toRequestWithoutBody(req: NodeRequest) {
  const host = req.headers.host ?? "localhost"
  return new Request(`${getProtocol(req)}://${host}${req.originalUrl ?? req.url}`, {
    method: req.method,
    headers: toHeaders(req.headers),
  })
}

function getProtocol({ headers, socket }: IncomingMessage) {
  const forwardedProto = headers["x-forwarded-proto"]
  if (typeof forwardedProto === "string") {
    return forwardedProto.replace(/,.*/, "").trim()
  }
  return socket instanceof TLSSocket ? "https" : "http"
}

function toHeaders(nodeHeaders: IncomingHttpHeaders) {
  const headers = new Headers()
  for (const [name, value = []] of Object.entries(nodeHeaders)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      headers.append(name, item)
    }
  }
  return headers
}
