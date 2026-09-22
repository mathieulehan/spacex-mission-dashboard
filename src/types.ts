export type Launch = {
  id: string
  sourceUrl: string
  name: string
  status: { name: string; abbrev: string; description: string }
  lastUpdated: string
  net: string
  windowStart: string
  windowEnd: string
  precision: { name: string; abbrev: string; description: string }
  probability: number | null
  weatherConcerns: string | null
  holdReason: string | null
  failReason: string | null
  provider: string
  rocket: string
  rocketFamily: string
  missionName: string | null
  missionDescription: string | null
  missionType: string | null
  orbit: string | null
  orbitAbbrev: string | null
  pad: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  webcastLive: boolean
  imageUrl: string | null
}

export type Launches = {
  total: number
  stale: boolean
  sampled: boolean
  results: Launch[]
}

export type LaunchDetail = Launch & {
  stale?: boolean
  flightClubUrl: string | null
  rocketDetails: {
    description: string | null
    reusable: boolean | null
    lengthMeters: number | null
    diameterMeters: number | null
    launchCostUsd: number | null
    leoCapacityKg: number | null
    gtoCapacityKg: number | null
    launches: number | null
    successes: number | null
    infoUrl: string | null
    wikiUrl: string | null
  }
  stages: Array<{
    type: string
    serialNumber: string
    details: string | null
    reused: boolean | null
    flightNumber: number | null
    landing: {
      attempted: boolean
      description: string | null
      type: string | null
      location: string | null
    } | null
  }>
  padDetails: {
    description: string | null
    mapUrl: string | null
    wikiUrl: string | null
  } | null
  links: Array<{
    title: string
    description: string | null
    url: string
    source: string
    type: string
  }>
  videos: Array<{
    title: string
    description: string | null
    url: string
    source: string
    type: string
    startsAt: string | null
  }>
  timeline: Array<{
    label: string
    description: string
    relativeTime: string
  }>
  updates: Array<{
    comment: string
    url: string | null
    createdAt: string
  }>
}

export type SpaceEvent = {
  id: number
  sourceUrl: string
  name: string
  type: string
  description: string | null
  date: string
  precision: string
  location: string | null
  webcastLive: boolean
  videoUrl: string | null
  newsUrl: string | null
  imageUrl: string | null
  lastUpdated: string
}

export type Events = {
  total: number
  stale: boolean
  sampled: boolean
  results: SpaceEvent[]
}

export type StarlinkSummary = {
  fetchedAt: string
  calculatedAt: string
  stale: boolean
  sampled: boolean
  count: number
  newestEpoch: string | null
  averageInclination: number
  averageAltitudeKm: number
  averagePeriodMinutes: number
  inclinationBands: Array<{ inclination: number; count: number }>
  plot: Array<{
    id: number
    name: string
    raan: number
    inclination: number
    anomaly: number
    altitudeKm?: number
  }>
  positions: Array<{
    id: number
    name: string
    latitude: number
    longitude: number
    altitudeKm: number
  }>
  satellites: Array<{
    name: string
    objectId: string
    noradId: number
    epoch: string
    inclination: number
    eccentricity: number
    periodMinutes: number
    altitudeKm: number
  }>
}

export type LaunchPerYear = {
  year: number
  planned: number
  completed: number
  rate: number
}

export type StatsLaunchPerYear = {
  year: number
  planned: number
  completed: number
  rate: number
}

export type StatsLaunchCadence = {
  totalLaunches: number
  successfulLaunches: number
  failedLaunches: number
  successRate: number
  mostSuccessive: number
  currentSuccessive: number
  launchesPerYear: LaunchPerYear[]
  mostLaunchesInYear: LaunchPerYear
  launchGoal2026: { planned: number; completed: number; rate: number }
}

export type StatsBoosterFastestTurnaround = {
  duration: string
  booster?: string
  firstFlight: string
  secondFlight: string
}

export type StatsBooster = {
  totalLanded: number
  totalAttempts: number
  landingRate: number
  mostFlights: { booster: string; flights: number }
  reflown: number
  block5Landed: number
  block5Attempts: number
  block5Rate: number
  block5Reflown: number
  fastestTurnaround: StatsBoosterFastestTurnaround
  fastestTurnaroundCapeCanaveral: StatsBoosterFastestTurnaround
  fastestTurnaroundVandenberg: StatsBoosterFastestTurnaround
  fastestTurnaroundStarbase: StatsBoosterFastestTurnaround
}

export type StatsLandingSite = {
  landed: number
  attempts: number
  rate: number
}

export type StatsLandingSites = {
  LZ1: StatsLandingSite
  LZ2: StatsLandingSite
  LZ4: StatsLandingSite
  LZ40: StatsLandingSite
  ASOG: StatsLandingSite
  JRTI: StatsLandingSite
  OCISLY: StatsLandingSite
  Catch: StatsLandingSite
}

export type StatsStarlink = {
  inOrbit: number
  starlinkLaunches: number
  totalLaunches: number
  starlinkRate: number
  heaviestLeoLift: { mass: string; mission: string }
  heaviestGtoLift: { mass: string; mission: string }
}

export type StatsDragon = {
  cargoMissions: number
  crewMissions: number
  testMissions: number
  issCargoUp: string
  issCargoDown: string
  reflights: number
  crewInOrbit: number
  crewFlownTotal: number
}

export type StatsCapsule = {
  landed: number
  attempts: number
  rate: number
  reflown: number
}

export type StatsBusiness = {
  revenue2025: string
  valuation: string
  employees: string
  starlinkSubscribers: string
  starlinkRevenue: string
}

export type Stats = {
  fetchedAt: string
  stale: boolean
  source?: 'spacexnow' | 'api' | 'fallback'
  launchCadence: StatsLaunchCadence
  boosters: StatsBooster
  starlink: StatsStarlink
  landingSites: StatsLandingSites
  dragons: StatsDragon
  capsules: StatsCapsule
  business: StatsBusiness
  starlinkSubscribers?: number | null
  launchesThisYear?: number | null
  launchesThisYearGoal?: number | null
  totalLaunches?: number | null
  totalLaunchesSuccessRate?: number | null
  boosterReflights?: number | null
  boosterLandingSuccessRate?: number | null
  maxBoosterFlights?: number | null
  starlinkSatsInOrbit?: number | null
  falcon9Launches?: number | null
  falcon9SuccessRate?: number | null
  falconHeavyLaunches?: number | null
  starshipLaunches?: number | null
  starshipSuccessRate?: number | null
  fastestTurnaroundMinutes?: number | null
  fastestBoosterTurnaroundDays?: number | null
  busiestLaunchSiteName?: string | null
  busiestLaunchSiteLaunches?: number | null
  capsuleReflights?: number | null
  capsuleLandingSuccessRate?: number | null
  crewFlownTotal?: number | null
  marketSharePercentage?: number | null
  revenueEstimateUsd?: number | null
  employeesEstimate?: number | null
  falconHeavyTotalLaunches?: number | null
  falconHeavySuccessRate?: number | null
  dragonCargoMassUpKg?: number | null
  dragonCargoMassDownKg?: number | null
}

export type CacheStatus = {
  sources: Array<{
    key: string
    label: string
    fetchedAt: string | null
    refreshAfter: string | null
    sizeBytes: number
    fresh: boolean
    nextAttemptAt: string
    nextAttemptReason: string
  }>
  missionDetailsStored: number
}
