import { toJsxRuntime } from "hast-util-to-jsx-runtime"
import { Fragment, jsx, jsxs } from "react/jsx-runtime"
import type { DecorationItem } from "shiki"
import { highlight } from "@/lib/highlight"

export type CodeProps = {
  code: string
  decorations?: DecorationItem[]
  className?: string
}

export async function Code({ code, decorations, className }: CodeProps) {
  const tree = await highlight(code, decorations)

  return <div className={className}>{toJsxRuntime(tree, { Fragment, jsx, jsxs })}</div>
}
