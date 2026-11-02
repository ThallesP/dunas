import { PGlite } from "@electric-sql/pglite"

const cache = globalThis as { database?: PGlite }

export const database = cache.database ?? new PGlite("./.pglite")

cache.database = database
