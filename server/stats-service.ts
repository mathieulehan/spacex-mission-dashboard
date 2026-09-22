import { z } from 'zod'
import type { StatsSnapshot } from './stats-types.js'
import { STATS_CACHE_KEY, STATS_CACHE_TTL_MS } from './stats-types.js'
import { STATS_FALLBACK_SNAPSHOT } from './stats-fallback.js'
import { fetchLiveStats } from './stats-scraper.js'
import { UpstreamError } from './upstream.js'
import type { CacheStore } from './cache-store.js'

// Zod schema for StatsSnapshot cache validation
const StatsSnapshotSchema = z.object({
  fetchedAt: z.string(),
  stale: z.boolean(),
  source: z.enum(['spacexnow', 'api', 'fallback']),
  starlinkSubscribers: z.number().nullable(),
  launchesThisYear: z.number().nullable(),
  launchesThisYearGoal: z.number().nullable(),
  totalLaunches: z.number().nullable(),
  totalLaunchesSuccessRate: z.number().nullable(),
  boosterReflights: z.number().nullable(),
  boosterLandingSuccessRate: z.number().nullable(),
  maxBoosterFlights: z.number().nullable(),
  starlinkSatsInOrbit: z.number().nullable(),
  falcon9Launches: z.number().nullable(),
  falcon9SuccessRate: z.number().nullable(),
  falconHeavyLaunches: z.number().nullable(),
  starshipLaunches: z.number().nullable(),
  starshipSuccessRate: z.number().nullable(),
  fastestTurnaroundMinutes: z.number().nullable(),
  fastestBoosterTurnaroundDays: z.number().nullable(),
  busiestLaunchSiteName: z.string().nullable(),
  busiestLaunchSiteLaunches: z.number().nullable(),
  capsuleReflights: z.number().nullable(),
  capsuleLandingSuccessRate: z.number().nullable(),
  crewFlownTotal: z.number().nullable(),
  marketSharePercentage: z.number().nullable(),
  revenueEstimateUsd: z.number().nullable(),
  employeesEstimate: z.number().nullable(),
  falconHeavyTotalLaunches: z.number().nullable(),
  falconHeavySuccessRate: z.number().nullable(),
  dragonCargoMassUpKg: z.number().nullable(),
  dragonCargoMassDownKg: z.number().nullable(),
})

export class StatsService {
  private blockedUntil = 0
  private blockedError: UpstreamError | null = null

  constructor(
    private readonly cache: CacheStore,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async getStats(): Promise<StatsSnapshot> {
    // 1. Return cached value if fresh.
    const cached = await this.cache.get(STATS_CACHE_KEY, StatsSnapshotSchema)
    if (cached && Date.now() - cached.fetchedAt < STATS_CACHE_TTL_MS) {
      return cached.value ?? { ...STATS_FALLBACK_SNAPSHOT, stale: true }
    }

    // 2. If blocked by a cooldown, return stale cache or fallback.
    if (Date.now() < this.blockedUntil && this.blockedError) {
      if (cached) return cached.value ?? { ...STATS_FALLBACK_SNAPSHOT, stale: true }
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
      if (cached) return cached.value ?? { ...STATS_FALLBACK_SNAPSHOT, stale: true }
      return { ...STATS_FALLBACK_SNAPSHOT, stale: true }
    }
  }
}
