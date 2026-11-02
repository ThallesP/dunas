import { createGetUrl } from "fumadocs-core/source"

export const docsRoute = "/docs"
export const docsMarkdownRoute = "/llms.mdx/docs"

const getMarkdownUrl = createGetUrl(docsMarkdownRoute)

export function getPageMarkdownUrl({ slugs }: { slugs: string[] }) {
  const segments = [...slugs, "content.md"]
  return { segments, url: getMarkdownUrl(segments) }
}
