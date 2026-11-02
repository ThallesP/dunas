import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

// Temporary dev-only store for the inline copy editor. Remove once the copy is applied.
const editsPath = join(process.cwd(), "copy-edits.json")
const isDev = process.env.NODE_ENV === "development"

type Edits = Record<string, string>

async function readEdits(): Promise<Edits> {
  const edits = await readFile(editsPath, "utf8").catch(() => "{}")
  return JSON.parse(edits)
}

export async function GET() {
  if (!isDev) return new Response(null, { status: 404 })

  return Response.json(await readEdits())
}

// Merges one edit into the file so edits written elsewhere are never overwritten.
export async function POST(request: Request) {
  if (!isDev) return new Response(null, { status: 404 })

  const { original, text }: { original: string; text: string } = await request.json()
  const { [original]: _, ...edits } = await readEdits()
  const nextEdits = text === original ? edits : { ...edits, [original]: text }
  await writeFile(editsPath, `${JSON.stringify(nextEdits, null, 2)}\n`)
  return Response.json(nextEdits)
}
