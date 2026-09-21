export type StatsSnapshot = {
  fetchedAt: string
  stale: boolean
  source: 'spacexnow' | 'api' | 'fallback'
  /** Priority metrics */
  starlinkSubscribers: number | null
  launchesThisYear: number | null
  launchesThisYearGoal: number | null
  totalLaunches: number | null
  totalLaunchesSuccessRate: number | null
  boosterReflights: number | null
  boosterLandingSuccessRate: number | null
  maxBoosterFlights: number | null
  starlinkSatsInOrbit: number | null
  /** Secondary metrics */
  falcon9Launches: number | null
  falcon9SuccessRate: number | null
  falconHeavyLaunches: number | null
  starshipLaunches: number | null
  starshipSuccessRate: number | null
  fastestTurnaroundMinutes: number | null
  fastestBoosterTurnaroundDays: number | null
  busiestLaunchSiteName: string | null
  busiestLaunchSiteLaunches: number | null
  capsuleReflights: number | null
  capsuleLandingSuccessRate: number | null
  crewFlownTotal: number | null
  marketSharePercentage: number | null
  revenueEstimateUsd: number | null
  employeesEstimate: number | null
  falconHeavyTotalLaunches: number | null
  falconHeavySuccessRate: number | null
  dragonCargoMassUpKg: number | null
  dragonCargoMassDownKg: number | null
}

export const STATS_CACHE_KEY = 'spacex:stats'
export const STATS_CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
