import { createClient, type Client } from '@libsql/client'
import { gzipSync, gunzipSync } from 'node:zlib'
import type { ZodType } from 'zod'
import type {
  CacheMetadata,
  CachedValue,
  CacheStore,
} from './cache-store.js'

const COMPRESSION_THRESHOLD_BYTES = 256 * 1_024
const GZIP_PREFIX = 'gzip:'

function encodePayload(value: unknown) {
  const json = JSON.stringify(value)
  return Buffer.byteLength(json) >= COMPRESSION_THRESHOLD_BYTES
    ? `${GZIP_PREFIX}${gzipSync(json).toString('base64')}`
    : json
}

function decodePayload(payload: string) {
  return payload.startsWith(GZIP_PREFIX)
    ? gunzipSync(Buffer.from(payload.slice(GZIP_PREFIX.length), 'base64')).toString()
    : payload
}

export class TursoCache implements CacheStore {
  private readonly client: Client
  private readonly ready: Promise<unknown>

  constructor(url: string, authToken?: string) {
    this.client = createClient({ url, authToken })
    this.ready = this.client.execute(`
      CREATE TABLE IF NOT EXISTS api_cache (
        cache_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      )
    `)
  }

  async get<T>(
    key: string,
    schema: ZodType<T>,
  ): Promise<CachedValue<T> | null> {
    await this.ready
    const result = await this.client.execute({
      sql: 'SELECT payload, fetched_at FROM api_cache WHERE cache_key = ?',
      args: [key],
    })
    const row = result.rows[0]
    if (!row || typeof row.payload !== 'string') return null

    try {
      const parsed = schema.safeParse(JSON.parse(decodePayload(row.payload)))
      if (parsed.success) {
        return { value: parsed.data, fetchedAt: Number(row.fetched_at) }
      }
    } catch {
      // Invalid rows are removed and replaced after a successful provider fetch.
    }

    await this.client.execute({
      sql: 'DELETE FROM api_cache WHERE cache_key = ?',
      args: [key],
    })
    return null
  }

  async set(key: string, value: unknown, fetchedAt = Date.now()) {
    await this.ready
    await this.client.execute({
      sql: `
        INSERT INTO api_cache (cache_key, payload, fetched_at)
        VALUES (?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          payload = excluded.payload,
          fetched_at = excluded.fetched_at
      `,
      args: [key, encodePayload(value), fetchedAt],
    })
  }

  async metadata(): Promise<CacheMetadata[]> {
    await this.ready
    const result = await this.client.execute(`
      SELECT cache_key, fetched_at, length(payload) AS size_bytes
      FROM api_cache
      ORDER BY cache_key
    `)
    return result.rows.map((row) => ({
      key: String(row.cache_key),
      fetchedAt: Number(row.fetched_at),
      sizeBytes: Number(row.size_bytes),
    }))
  }

  close() {
    this.client.close()
  }
}
