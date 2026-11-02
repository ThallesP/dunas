import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation"
import { type NextRequest, NextResponse } from "next/server"
import { docsMarkdownRoute, docsRoute } from "@/lib/docs-routes"

const { rewrite: rewriteDocs } = rewritePath(
  `${docsRoute}{/*path}`,
  `${docsMarkdownRoute}{/*path}/content.md`,
)
const { rewrite: rewriteSuffix } = rewritePath(
  `${docsRoute}{/*path}.md`,
  `${docsMarkdownRoute}{/*path}/content.md`,
)

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const suffixPath = rewriteSuffix(pathname)
  if (suffixPath) {
    return NextResponse.rewrite(new URL(suffixPath, request.nextUrl))
  }

  const markdownPath = isMarkdownPreferred(request) ? rewriteDocs(pathname) : false
  if (markdownPath) {
    return NextResponse.rewrite(new URL(markdownPath, request.nextUrl), {
      headers: { Vary: "Accept" },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/docs/:path*"],
}
