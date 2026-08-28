import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  STARLINK_BOOTSTRAP_FETCHED_AT,
  STARLINK_BOOTSTRAP_RECORDS,
} from './bootstrap.js'
import { summarizeStarlink } from './normalize.js'
import {
  celestrakRecordsSchema,
  type CelestrakRecord,
} from './schemas.js'
import { UpstreamClient, UpstreamError } from './upstream.js'

const CELESTRAK_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json'
const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1_000

type DiskCache = {
  fetchedAt: string
  records: CelestrakRecord[]
}

export class StarlinkService {
  private blockedUntil = 0
  private blockedError: UpstreamError | null = null

  constructor(
    private readonly upstream: UpstreamClient,
    private readonly cachePath: string | null,
  ) {}

  async getSummary() {
    const cached = await this.readCache()
    if (
      cached &&
      Date.now() - Date.parse(cached.fetchedAt) < REFRESH_INTERVAL_MS
    ) {
      return summarizeStarlink(cached.records, cached.fetchedAt, false)
    }
    if (Date.now() < this.blockedUntil && this.blockedError) {
      if (cached) {
        return summarizeStarlink(cached.records, cached.fetchedAt, true)
      }
      return summarizeStarlink(
        STARLINK_BOOTSTRAP_RECORDS,
        STARLINK_BOOTSTRAP_FETCHED_AT,
        true,
        true,
      )
    }

    try {
      const records = await this.upstream.get(
        CELESTRAK_URL,
        celestrakRecordsSchema,
        { headers: { accept: 'application/json' } },
        REFRESH_INTERVAL_MS / 1_000,
      )
      const fetchedAt = new Date().toISOString()
      await this.writeCache({ fetchedAt, records })
      return summarizeStarlink(records, fetchedAt, false)
    } catch (error) {
      const exposedError =
        error instanceof UpstreamError && error.message.includes('403')
          ? new UpstreamError(
              'CelesTrak download cooldown is active; try again after its two-hour update window',
              503,
              'CELESTRAK_COOLDOWN',
            )
          : error
      if (exposedError instanceof UpstreamError) {
        this.blockedUntil = Date.now() + REFRESH_INTERVAL_MS
        this.blockedError = exposedError
      }
      if (cached) {
        return summarizeStarlink(cached.records, cached.fetchedAt, true)
      }
      return summarizeStarlink(
        STARLINK_BOOTSTRAP_RECORDS,
        STARLINK_BOOTSTRAP_FETCHED_AT,
        true,
        true,
      )
    }
  }

  private async readCache(): Promise<DiskCache | null> {
    if (!this.cachePath) return null
    try {
      const value = JSON.parse(await readFile(this.cachePath, 'utf8')) as {
        fetchedAt?: unknown
        records?: unknown
      }
      if (typeof value.fetchedAt !== 'string') return null
      const records = celestrakRecordsSchema.safeParse(value.records)
      return records.success
        ? { fetchedAt: value.fetchedAt, records: records.data }
        : null
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error ? error.code : null
      if (code === 'ENOENT') return null
      throw error
    }
  }

  private async writeCache(cache: DiskCache) {
    if (!this.cachePath) return
    const directory = path.dirname(this.cachePath)
    const temporaryPath = `${this.cachePath}.tmp`
    await mkdir(directory, { recursive: true })
    await writeFile(temporaryPath, JSON.stringify(cache), 'utf8')
    await rename(temporaryPath, this.cachePath)
  }
}
