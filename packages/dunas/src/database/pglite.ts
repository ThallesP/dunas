import type { PGlite } from "@electric-sql/pglite"
import type { Database } from "./database.ts"

export function pglite(db: PGlite): Database {
  return {
    async query<TRow>(sql: string, params: readonly unknown[] = []) {
      const { rows } = await db.query<TRow>(sql, [...params])
      return rows
    },
    transaction(run) {
      return db.transaction((tx) =>
        run({
          async query<TRow>(sql: string, params: readonly unknown[] = []) {
            const { rows } = await tx.query<TRow>(sql, [...params])
            return rows
          },
        }),
      )
    },
  }
}
