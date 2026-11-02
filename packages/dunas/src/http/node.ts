import type { ServerResponse } from "node:http"
import { buffer } from "node:stream/consumers"
import { type NodeRequest, toRequestWithoutBody } from "./node-request.ts"

export function toNodeHandler(handler: (request: Request) => Promise<Response>) {
  return async (req: NodeRequest, res: ServerResponse) => {
    const response = await handler(await toRequest(req))

    res.statusCode = response.status
    for (const [name, value] of response.headers) {
      if (name !== "set-cookie") {
        res.setHeader(name, value)
      }
    }
    res.appendHeader("set-cookie", response.headers.getSetCookie())
    res.end(await response.bytes())
  }
}

async function toRequest(req: NodeRequest) {
  return new Request(toRequestWithoutBody(req), { body: await readBody(req) })
}

async function readBody(req: NodeRequest) {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined
  }
  if (req.rawBody) {
    return new Uint8Array(req.rawBody)
  }
  if (!req.readableEnded) {
    return buffer(req)
  }
  if (Buffer.isBuffer(req.body)) {
    return new Uint8Array(req.body)
  }
  return typeof req.body === "string" ? req.body : JSON.stringify(req.body)
}
