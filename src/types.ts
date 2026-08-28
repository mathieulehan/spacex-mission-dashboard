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
