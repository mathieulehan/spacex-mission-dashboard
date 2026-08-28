import {
  STARLINK_BOOTSTRAP_FETCHED_AT,
  STARLINK_BOOTSTRAP_RECORDS,
} from './bootstrap.js'
import type { CacheStore } from './cache-store.js'
import { summarizeStarlink } from './normalize.js'
import { celestrakRecordsSchema } from './schemas.js'
import { UpstreamClient, UpstreamError } from './upstream.js'

const CELESTRAK_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json'
const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1_000
const CACHE_KEY = 'celestrak:starlink'

export class StarlinkService {
  private blockedUntil = 0
  private blockedError: UpstreamError | null = null

  constructor(
    private readonly upstream: UpstreamClient,
    private readonly cache: CacheStore,
  ) {}

  getRetryAt() {
    return this.blockedUntil > Date.now() ? this.blockedUntil : null
  }

  async getSummary() {
    const cached = await this.cache.get(CACHE_KEY, celestrakRecordsSchema)
    const cachedAt = cached
      ? new Date(cached.fetchedAt).toISOString()
      : STARLINK_BOOTSTRAP_FETCHED_AT
    if (
      cached &&
      Date.now() - cached.fetchedAt < REFRESH_INTERVAL_MS
    ) {
      return summarizeStarlink(cached.value, cachedAt, false)
    }
    if (Date.now() < this.blockedUntil && this.blockedError) {
      if (cached) {
        return summarizeStarlink(cached.value, cachedAt, true)
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
      await this.cache.set(CACHE_KEY, records, Date.parse(fetchedAt))
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
        return summarizeStarlink(cached.value, cachedAt, true)
      }
      return summarizeStarlink(
        STARLINK_BOOTSTRAP_RECORDS,
        STARLINK_BOOTSTRAP_FETCHED_AT,
        true,
        true,
      )
    }
  }

}
