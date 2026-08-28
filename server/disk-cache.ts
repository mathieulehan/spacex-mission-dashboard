import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ZodType } from 'zod'
import type {
  CacheMetadata,
  CachedValue,
  CacheStore,
} from './cache-store.js'

type CacheRow = {
  payload: string
  fetched_at: number
}

export class DiskCache implements CacheStore {
  constructor(private readonly databasePath: string | null) {
    this.withDatabase((database) => {
      database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS api_cache (
        cache_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      );
    `)
    })
  }

  get<T>(key: string, schema: ZodType<T>): CachedValue<T> | null {
    return this.withDatabase((database) => {
      const row = database
        .prepare('SELECT payload, fetched_at FROM api_cache WHERE cache_key = ?')
        .get(key) as CacheRow | undefined
      if (!row) return null

      try {
        const parsed = schema.safeParse(JSON.parse(row.payload))
        if (parsed.success) {
          return { value: parsed.data, fetchedAt: row.fetched_at }
        }
      } catch {
        // Invalid cache entries are removed and replaced by the next successful fetch.
      }

      database.prepare('DELETE FROM api_cache WHERE cache_key = ?').run(key)
      return null
    })
  }

  set(key: string, value: unknown, fetchedAt = Date.now()) {
    this.withDatabase((database) => {
      database.prepare(`
        INSERT INTO api_cache (cache_key, payload, fetched_at)
        VALUES (?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          payload = excluded.payload,
          fetched_at = excluded.fetched_at
      `)
        .run(key, JSON.stringify(value), fetchedAt)
    })
  }

  metadata(): CacheMetadata[] {
    return (
      this.withDatabase((database) =>
        (
          database
            .prepare(`
              SELECT cache_key, fetched_at, length(payload) AS size_bytes
              FROM api_cache
              ORDER BY cache_key
            `)
            .all() as Array<{
            cache_key: string
            fetched_at: number
            size_bytes: number
          }>
        ).map((row) => ({
          key: row.cache_key,
          fetchedAt: row.fetched_at,
          sizeBytes: row.size_bytes,
        })),
      ) ?? []
    )
  }

  private withDatabase<T>(operation: (database: DatabaseSync) => T): T | null {
    if (!this.databasePath) return null

    mkdirSync(path.dirname(this.databasePath), { recursive: true })
    const database = new DatabaseSync(this.databasePath)
    try {
      return operation(database)
    } finally {
      database.close()
    }
  }
}
