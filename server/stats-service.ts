import type { StatsSnapshot } from './stats-types.js'
import { STATS_CACHE_KEY, STATS_CACHE_TTL_MS } from './stats-types.js'
import { STATS_FALLBACK_SNAPSHOT } from './stats-fallback.js'
import { fetchLiveStats } from './stats-scraper.js'
import { UpstreamError } from './upstream.js'
import type { CacheStore } from './cache-store.js'

export class StatsService {
  private blockedUntil = 0
  private blockedError: UpstreamError | null = null

  constructor(
    private readonly cache: CacheStore,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async getStats(): Promise<StatsSnapshot> {
    // 1. Return cached value if fresh.
    const cached = await this.cache.get(STATS_CACHE_KEY, this.statsSchema)
    if (cached && Date.now() - cached.fetchedAt < STATS_CACHE_TTL_MS) {
      return cached.value
    }

    // 2. If blocked by a cooldown, return stale cache or fallback.
    if (Date.now() < this.blockedUntil && this.blockedError) {
      if (cached) return cached.value
      return { ...STATS_FALLBACK_SNAPSHOT, stale: true }
    }

    // 3. Try to fetch live data from spacexnow.com.
    try {
      const live = await fetchLiveStats(this.fetchImpl)
      const fetchedAt = new Date().toISOString()
      await this.cache.set(STATS_CACHE_KEY, live, Date.parse(fetchedAt))
      this.blockedUntil = 0
      this.blockedError = null
      return live
    } catch (error) {
      if (error instanceof UpstreamError) {
        this.blockedUntil = Date.now() + STATS_CACHE_TTL_MS
        this.blockedError = error
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'stats_upstream_failure',
          reason: error.message,
          code: error.code,
        }))
      }
      if (cached) return cached.value
      return { ...STATS_FALLBACK_SNAPSHOT, stale: true }
    }
  }

  /**
   * Minimal inline schema so the cache layer can validate the stored stats
   * snapshot without pulling in the full stats-schema module at runtime.
   */
  private readonly statsSchema = {
    safeParse: (value: unknown) => {
      if (typeof value !== 'object' || value === null) {
        return { success: false, error: new Error('not an object') }
      }
      const obj = value as Record<string, unknown>
      if (typeof obj.fetchedAt !== 'string') return { success: false, error: new Error('missing fetchedAt') }
      if (typeof obj.stale !== 'boolean') return { success: false, error: new Error('missing stale') }
      if (typeof obj.source !== 'string') return { success: false, error: new Error('missing source') }
      return {
        success: true,
        data: value as StatsSnapshot,
      }
    },
  }
}
