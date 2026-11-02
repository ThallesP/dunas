export type Queryable = {
  query<TRow>(sql: string, params?: readonly unknown[]): Promise<TRow[]>
}

export type Database = Queryable & {
  transaction<T>(run: (tx: Queryable) => Promise<T>): Promise<T>
}

export async function queryOne<TRow>(db: Queryable, sql: string, params?: readonly unknown[]) {
  const [row] = await db.query<TRow>(sql, params)
  if (!row) {
    throw new Error("Expected a row but the query returned none")
  }
  return row
}

export async function queryMaybe<TRow>(db: Queryable, sql: string, params?: readonly unknown[]) {
  const [row] = await db.query<TRow>(sql, params)
  return row ?? null
}
