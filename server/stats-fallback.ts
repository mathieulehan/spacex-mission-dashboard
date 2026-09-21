import type { StatsSnapshot } from './stats-types.js'

// Curated baseline derived from spacexnow.com/stats, public reporting,
// and the S-1 SEC filing. Refreshed from spacexnow.com when the upstream
// is reachable; otherwise the dashboard shows this known-good snapshot.

export const STATS_FALLBACK_SNAPSHOT: StatsSnapshot = {
  fetchedAt: '2026-09-20T00:00:00.000Z',
  stale: true,
  source: 'fallback',
  starlinkSubscribers: 14_500_000,
  launchesThisYear: 111,
  launchesThisYearGoal: 145,
  totalLaunches: 721,
  totalLaunchesSuccessRate: 98.34,
  boosterReflights: 625,
  boosterLandingSuccessRate: 96.65,
  maxBoosterFlights: 37,
  starlinkSatsInOrbit: 11_160,
  falcon9Launches: 690,
  falcon9SuccessRate: 99.57,
  falconHeavyLaunches: 13,
  starshipLaunches: 13,
  starshipSuccessRate: 53.85,
  fastestTurnaroundMinutes: 38,
  fastestBoosterTurnaroundDays: 9.13,
  busiestLaunchSiteName: 'Cape Canaveral',
  busiestLaunchSiteLaunches: 344,
  capsuleReflights: 33,
  capsuleLandingSuccessRate: 98.25,
  crewFlownTotal: 74,
  marketSharePercentage: 86.7,
  revenueEstimateUsd: 13_000_000_000,
  employeesEstimate: 14_000,
  falconHeavyTotalLaunches: 13,
  falconHeavySuccessRate: 100,
  dragonCargoMassUpKg: 70_000,
  dragonCargoMassDownKg: 49_000,
}
