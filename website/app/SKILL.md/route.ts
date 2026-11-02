import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { docsLlms } from "@/lib/source"

export const revalidate = false

export async function GET() {
  const skill = await readFile(join(process.cwd(), "content/skill.md"), "utf8")
  return new Response(`${skill}\n${await docsLlms.full()}`, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  })
}
