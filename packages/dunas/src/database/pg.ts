import type { Pool, PoolClient } from "pg"
import type { Database } from "./database.ts"

export function pg(pool: Pool): Database {
  return {
    async query<TRow>(sql: string, params: readonly unknown[] = []) {
      const { rows } = await pool.query(sql, [...params])
      return rows as TRow[]
    },
    async transaction(run) {
      const client: PoolClient = await pool.connect()
      try {
        await client.query("BEGIN")
        const result = await run({
          async query<TRow>(sql: string, params: readonly unknown[] = []) {
            const { rows } = await client.query(sql, [...params])
            return rows as TRow[]
          },
        })
        await client.query("COMMIT")
        return result
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },
  }
}
