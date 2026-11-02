import { codeToHast, type DecorationItem } from "shiki"
import { codeTheme } from "./code-theme"

export function highlight(code: string, decorations: DecorationItem[] = []) {
  return codeToHast(code, { lang: "tsx", theme: codeTheme, decorations })
}
