import {
  STARLINK_BOOTSTRAP_FETCHED_AT,
  STARLINK_BOOTSTRAP_RECORDS,
} from './bootstrap.js'
import type { CacheStore } from './cache-store.js'
import { summarizeStarlink } from './normalize.js'
import {
  celestrakRecordsSchema,
  type CelestrakRecord,
} from './schemas.js'
import { UpstreamClient, UpstreamError } from './upstream.js'

const CELESTRAK_GP_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json'
const CELESTRAK_SUPPLEMENTAL_URL =
  'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json'
const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1_000
const CACHE_KEY = 'celestrak:starlink'
const REQUEST_OPTIONS = {
  headers: {
    accept: 'application/json',
    'user-agent': 'spacex-mission-dashboard/1.0',
  },
}

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
      let records: CelestrakRecord[]
      try {
        records = await this.upstream.get(
          CELESTRAK_GP_URL,
          celestrakRecordsSchema,
          REQUEST_OPTIONS,
          REFRESH_INTERVAL_MS / 1_000,
        )
      } catch (error) {
        if (!(error instanceof UpstreamError) || error.upstreamStatus !== 403) {
          throw error
        }
        records = await this.upstream.get(
          CELESTRAK_SUPPLEMENTAL_URL,
          celestrakRecordsSchema,
          REQUEST_OPTIONS,
          REFRESH_INTERVAL_MS / 1_000,
        )
      }
      const fetchedAt = new Date().toISOString()
      await this.cache.set(CACHE_KEY, records, Date.parse(fetchedAt))
      this.blockedUntil = 0
      this.blockedError = null
      return summarizeStarlink(records, fetchedAt, false)
    } catch (error) {
      const exposedError =
        error instanceof UpstreamError && error.upstreamStatus === 403
          ? new UpstreamError(
              'CelesTrak downloads are unavailable; try again after the two-hour update window',
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
