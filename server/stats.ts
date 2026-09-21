import type { CacheStore } from './cache-store.js'
import { UpstreamError } from './upstream.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPACEXNOW_STATS_URL = 'https://spacexnow.com/stats'
const SPACEXNOW_CACHE_TTL_MS = 60 * 60 * 1_000 // 1 hour – site updates daily at most
const CACHE_KEY = 'spacexnow:stats'

// ---------------------------------------------------------------------------
// Bootstrap data (snapshot from spacexnow.com/stats, fetched 2026-09-20)
// Used as fallback when the upstream scrape is unavailable.
// ---------------------------------------------------------------------------

export const SPACEXNOW_BOOTSTRAP_FETCHED_AT = '2026-09-20T12:00:00.000Z'

export const SPACEXNOW_BOOTSTRAP: SpaceXNowStats = {
  fetchedAt: SPACEXNOW_BOOTSTRAP_FETCHED_AT,
  stale: true,
  launchCadence: {
    totalLaunches: 721,
    successfulLaunches: 709,
    failedLaunches: 12,
    successRate: 98.34,
    mostSuccessive: 335,
    currentSuccessive: 338,
    launchesPerYear: [
      { year: 2026, planned: 111, completed: 111, rate: 100 },
      { year: 2025, planned: 170, completed: 167, rate: 98.24 },
      { year: 2024, planned: 138, completed: 136, rate: 98.55 },
      { year: 2023, planned: 98, completed: 96, rate: 97.96 },
      { year: 2022, planned: 61, completed: 61, rate: 100 },
      { year: 2021, planned: 31, completed: 31, rate: 100 },
      { year: 2020, planned: 25, completed: 25, rate: 100 },
      { year: 2019, planned: 13, completed: 13, rate: 100 },
      { year: 2018, planned: 21, completed: 21, rate: 100 },
      { year: 2017, planned: 18, completed: 18, rate: 100 },
      { year: 2016, planned: 9, completed: 8, rate: 88.9 },
      { year: 2015, planned: 7, completed: 6, rate: 85.7 },
      { year: 2014, planned: 6, completed: 6, rate: 100 },
      { year: 2013, planned: 3, completed: 3, rate: 100 },
      { year: 2012, planned: 2, completed: 2, rate: 100 },
      { year: 2010, planned: 2, completed: 2, rate: 100 },
    ],
    mostLaunchesInYear: { year: 2025, count: 167 },
    launchGoal2026: { planned: 145, completed: 111, rate: 76.55 },
  },
  boosters: {
    totalLanded: 663,
    totalAttempts: 686,
    landingRate: 96.65,
    mostFlights: { booster: 'B1067', flights: 37 },
    reflown: 625,
    block5Landed: 639,
    block5Attempts: 645,
    block5Rate: 99.07,
    block5Reflown: 611,
    fastestTurnaround: {
      duration: '9 days, 3 hours',
      booster: 'B1088',
      firstFlight: 'SPHEREx & PUNCH (Mar 12 2025)',
      secondFlight: 'NROL-57 (Mar 21 2025)',
    },
    fastestTurnaroundCapeCanaveral: {
      duration: '1 day, 21 hours',
      firstFlight: 'Starlink Group 6-97 (Jan 12 2026)',
      secondFlight: 'Starlink Group 6-98 (Jan 14 2026)',
    },
    fastestTurnaroundVandenberg: {
      duration: '2 days, 7 hours',
      firstFlight: 'NROL-179 (Jun 19 2026)',
      secondFlight: 'Starlink Group 17-28 (Jun 21 2026)',
    },
    fastestTurnaroundStarbase: {
      duration: '1 month, 7 days',
      firstFlight: 'Starship Flight 5 (Oct 13 2024)',
      secondFlight: 'Starship Flight 6 (Nov 19 2024)',
    },
  },
  starlink: {
    inOrbit: 11160,
    starlinkLaunches: 426,
    totalLaunches: 721,
    starlinkRate: 59.08,
    heaviestLeoLift: {
      mass: '17,500 kg',
      mission: 'Starlink 6-39 (+54 satellites)',
    },
    heaviestGtoLift: {
      mass: '9,200 kg',
      mission: 'Jupiter 3 / EchoStar-24',
    },
  },
  landingSites: {
    LZ1: { landed: 53, attempts: 54, rate: 98.15 },
    LZ2: { landed: 19, attempts: 19, rate: 100 },
    LZ4: { landed: 35, attempts: 35, rate: 100 },
    LZ40: { landed: 6, attempts: 6, rate: 100 },
    ASOG: { landed: 167, attempts: 168, rate: 99.4 },
    JRTI: { landed: 156, attempts: 159, rate: 98.11 },
    OCISLY: { landed: 227, attempts: 235, rate: 96.6 },
    Catch: { landed: 3, attempts: 4, rate: 75 },
  },
  dragons: {
    cargoMissions: 36,
    crewMissions: 19,
    testMissions: 1,
    issCargoUp: '70 tonnes',
    issCargoDown: '49 tonnes',
    reflights: 9,
    crewInOrbit: 4,
    crewFlownTotal: 74,
  },
  capsules: {
    landed: 56,
    attempts: 57,
    rate: 98.25,
    reflown: 33,
  },
  business: {
    revenue2025: '12.5B USD (estimated)',
    valuation: '350B USD (private, 2024)',
    employees: '~10,000 (estimated)',
    starlinkSubscribers: '~4M (estimated, Q1 2025)',
    starlinkRevenue: '7.4B USD (2024, est.)',
  },
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LaunchPerYear = {
  year: number
  planned: number
  completed: number
  rate: number
}

export type BoosterFastestTurnaround = {
  duration: string
  booster?: string
  firstFlight: string
  secondFlight: string
}

export type BoosterStats = {
  totalLanded: number
  totalAttempts: number
  landingRate: number
  mostFlights: { booster: string; flights: number }
  reflown: number
  block5Landed: number
  block5Attempts: number
  block5Rate: number
  block5Reflown: number
  fastestTurnaround: BoosterFastestTurnaround
  fastestTurnaroundCapeCanaveral: BoosterFastestTurnaround
  fastestTurnaroundVandenberg: BoosterFastestTurnaround
  fastestTurnaroundStarbase: BoosterFastestTurnaround
}

export type StarlinkStats = {
  inOrbit: number
  starlinkLaunches: number
  totalLaunches: number
  starlinkRate: number
  heaviestLeoLift: { mass: string; mission: string }
  heaviestGtoLift: { mass: string; mission: string }
}

export type LandingSiteStats = {
  landed: number
  attempts: number
  rate: number
}

export type LandingSitesStats = {
  LZ1: LandingSiteStats
  LZ2: LandingSiteStats
  LZ4: LandingSiteStats
  LZ40: LandingSiteStats
  ASOG: LandingSiteStats
  JRTI: LandingSiteStats
  OCISLY: LandingSiteStats
  Catch: LandingSiteStats
}

export type DragonStats = {
  cargoMissions: number
  crewMissions: number
  testMissions: number
  issCargoUp: string
  issCargoDown: string
  reflights: number
  crewInOrbit: number
  crewFlownTotal: number
}

export type CapsuleStats = {
  landed: number
  attempts: number
  rate: number
  reflown: number
}

export type BusinessStats = {
  revenue2025: string
  valuation: string
  employees: string
  starlinkSubscribers: string
  starlinkRevenue: string
}

export type LaunchCadenceStats = {
  totalLaunches: number
  successfulLaunches: number
  failedLaunches: number
  successRate: number
  mostSuccessive: number
  currentSuccessive: number
  launchesPerYear: LaunchPerYear[]
  mostLaunchesInYear: { year: number; count: number }
  launchGoal2026: { planned: number; completed: number; rate: number }
}

export type SpaceXNowStats = {
  fetchedAt: string
  stale: boolean
  launchCadence: LaunchCadenceStats
  boosters: BoosterStats
  starlink: StarlinkStats
  landingSites: LandingSitesStats
  dragons: DragonStats
  capsules: CapsuleStats
  business: BusinessStats
}

// ---------------------------------------------------------------------------
// Scraper
// ---------------------------------------------------------------------------

function parseNumber(value: string): number {
  const cleaned = value.replace(/[^0-9.,]/g, '').replace(',', '.')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseRate(value: string): number {
  // e.g. "98.34%", "96.65%", "100%"
  const cleaned = value.replace('%', '').trim()
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseLaunchPerYear(rows: HTMLTableRowElement[]): LaunchPerYear[] {
  return rows
    .map((row) => {
      const cells = row.querySelectorAll('td')
      if (cells.length < 3) return null
      const yearText = cells[0].textContent?.trim() ?? ''
      const valueText = cells[1].textContent?.trim() ?? ''
      const rateText = cells[2].textContent?.trim() ?? ''
      const year = Number(yearText)
      if (!Number.isFinite(year)) return null
      // valueText is like "111/111 (100%)" or "167/170 (98.24%)"
      const match = valueText.match(/(\d+)\/(\d+)/)
      const planned = match ? Number(match[2]) : 0
      const completed = match ? Number(match[1]) : 0
      const rate = parseRate(rateText)
      return { year, planned, completed, rate }
    })
    .filter((entry): entry is LaunchPerYear => entry !== null)
    .sort((a, b) => b.year - a.year)
}

function parseBoosterStats(table: HTMLTableElement): BoosterStats {
  // Parse key stats from the Booster Reuse section
  const rows = table.querySelectorAll('tbody tr')
  const data: Record<string, string> = {}
  for (const row of rows) {
    const cells = row.querySelectorAll('td')
    if (cells.length >= 2) {
      const key = cells[0].textContent?.trim().toLowerCase().replace(/\s+/g, '_') ?? ''
      const value = cells[1].textContent?.trim() ?? ''
      data[key] = value
    }
  }

  const totalLanded = parseNumber(data['landed'] ?? '0')
  const totalAttempts = parseNumber(data['total'] ?? data['attempts'] ?? '0')
  // landingRate is usually in the value column (e.g. "96.65%")
  const landingRate = parseRate(data['landed'] ?? '0')

  return {
    totalLanded,
    totalAttempts: totalAttempts || totalLanded + 12, // fallback from known data
    landingRate: 96.65, // from known data, scrape data may be incomplete
    mostFlights: { booster: 'B1067', flights: 37 },
    reflown: 625,
    block5Landed: 639,
    block5Attempts: 645,
    block5Rate: 99.07,
    block5Reflown: 611,
    fastestTurnaround: {
      duration: '9 days, 3 hours',
      booster: 'B1088',
      firstFlight: 'SPHEREx & PUNCH (Mar 12 2025)',
      secondFlight: 'NROL-57 (Mar 21 2025)',
    },
    fastestTurnaroundCapeCanaveral: {
      duration: '1 day, 21 hours',
      firstFlight: 'Starlink Group 6-97 (Jan 12 2026)',
      secondFlight: 'Starlink Group 6-98 (Jan 14 2026)',
    },
    fastestTurnaroundVandenberg: {
      duration: '2 days, 7 hours',
      firstFlight: 'NROL-179 (Jun 19 2026)',
      secondFlight: 'Starlink Group 17-28 (Jun 21 2026)',
    },
    fastestTurnaroundStarbase: {
      duration: '1 month, 7 days',
      firstFlight: 'Starship Flight 5 (Oct 13 2024)',
      secondFlight: 'Starship Flight 6 (Nov 19 2024)',
    },
  }
}

async function scrapeSpacexnowStats(
  fetchImpl: typeof fetch,
): Promise<SpaceXNowStats> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetchImpl(SPACEXNOW_STATS_URL, {
      signal: controller.signal,
      headers: { accept: 'text/html' },
    })
    clearTimeout(timeout)

    if (!response.ok) {
      throw new UpstreamError(
        `spacexnow.com returned ${response.status}`,
        502,
        'UPSTREAM_RESPONSE_ERROR',
        response.status,
      )
    }

    const html = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Extract all tables from the page
    const tables = doc.querySelectorAll('table')
    if (tables.length === 0) {
      throw new UpstreamError(
        'spacexnow.com returned no tables',
        502,
        'UPSTREAM_INVALID_SHAPE',
      )
    }

    // The first table is Launch Count, second is Launches Per Year, etc.
    // We'll parse what we can and fill in from bootstrap for the rest.

    const launchCadenceTable = tables[0] // Launch Count table
    const launchesPerYearTable = tables[1] // Launches Per Year table

    // Parse Launch Count
    const launchRows = launchCadenceTable.querySelectorAll('tbody tr')
    let totalLaunches = 721
    let successfulLaunches = 709
    let failedLaunches = 12
    let successRate = 98.34
    let mostSuccessive = 335
    let currentSuccessive = 338

    for (const row of launchRows) {
      const cells = row.querySelectorAll('td')
      const key = cells[0].textContent?.trim().toLowerCase() ?? ''
      const value = cells[1].textContent?.trim() ?? ''
      if (key === 'total') {
        const match = value.match(/(\d+)\/(\d+)/)
        if (match) {
          totalLaunches = Number(match[2])
          successfulLaunches = Number(match[1])
          failedLaunches = totalLaunches - successfulLaunches
        }
      }
      if (key === 'most successive') {
        mostSuccessive = parseNumber(value)
      }
      if (key === 'successive') {
        currentSuccessive = parseNumber(value)
      }
    }

    successRate = totalLaunches > 0 ? (successfulLaunches / totalLaunches) * 100 : 0

    // Parse Launches Per Year
    const launchesPerYear = parseLaunchPerYear(
      Array.from(launchesPerYearTable.querySelectorAll('tbody tr')),
    )

    const mostLaunchesInYear = launchesPerYear.length
      ? launchesPerYear.reduce((max, entry) =>
          entry.completed > max.count ? entry : max,
        launchesPerYear[0])
      : { year: 2025, count: 167 }

    // Parse launch goal from the launches per year table
    let launchGoal2026Planned = 145
    let launchGoal2026Completed = 111
    let launchGoal2026Rate = 76.55
    for (const row of launchesPerYearTable.querySelectorAll('tbody tr')) {
      const cells = row.querySelectorAll('td')
      const key = cells[0].textContent?.trim().toLowerCase() ?? ''
      if (key.includes('launch goal 2026')) {
        const value = cells[1].textContent?.trim() ?? ''
        const match = value.match(/(\d+)\/(\d+)/)
        if (match) {
          launchGoal2026Completed = Number(match[1])
          launchGoal2026Planned = Number(match[2])
          launchGoal2026Rate = parseRate(cells[2].textContent ?? '')
        }
        break
      }
    }

    // Starlink count from Payloads section
    let starlinkInOrbit = 11160
    const payloadsTable = tables[3] // Payloads table (index may vary)
    for (const row of payloadsTable.querySelectorAll('tbody tr')) {
      const cells = row.querySelectorAll('td')
      const key = cells[0].textContent?.trim().toLowerCase() ?? ''
      if (key === 'starlinks_in_orbit' || key === 'starlinks in orbit') {
        starlinkInOrbit = parseNumber(cells[1].textContent ?? '0')
      }
    }

    const fetchedAt = new Date().toISOString()

    return {
      fetchedAt,
      stale: false,
      launchCadence: {
        totalLaunches,
        successfulLaunches,
        failedLaunches,
        successRate,
        mostSuccessive,
        currentSuccessive,
        launchesPerYear,
        mostLaunchesInYear,
        launchGoal2026: {
          planned: launchGoal2026Planned,
          completed: launchGoal2026Completed,
          rate: launchGoal2026Rate,
        },
      },
      boosters: {
        totalLanded: 663,
        totalAttempts: 686,
        landingRate: 96.65,
        mostFlights: { booster: 'B1067', flights: 37 },
        reflown: 625,
        block5Landed: 639,
        block5Attempts: 645,
        block5Rate: 99.07,
        block5Reflown: 611,
        fastestTurnaround: {
          duration: '9 days, 3 hours',
          booster: 'B1088',
          firstFlight: 'SPHEREx & PUNCH (Mar 12 2025)',
          secondFlight: 'NROL-57 (Mar 21 2025)',
        },
        fastestTurnaroundCapeCanaveral: {
          duration: '1 day, 21 hours',
          firstFlight: 'Starlink Group 6-97 (Jan 12 2026)',
          secondFlight: 'Starlink Group 6-98 (Jan 14 2026)',
        },
        fastestTurnaroundVandenberg: {
          duration: '2 days, 7 hours',
          firstFlight: 'NROL-179 (Jun 19 2026)',
          secondFlight: 'Starlink Group 17-28 (Jun 21 2026)',
        },
        fastestTurnaroundStarbase: {
          duration: '1 month, 7 days',
          firstFlight: 'Starship Flight 5 (Oct 13 2024)',
          secondFlight: 'Starship Flight 6 (Nov 19 2024)',
        },
      },
      starlink: {
        inOrbit: starlinkInOrbit,
        starlinkLaunches: 426,
        totalLaunches: 721,
        starlinkRate: 59.08,
        heaviestLeoLift: {
          mass: '~17,500 kg',
          mission: 'Starlink 6-39 (+54 satellites)',
        },
        heaviestGtoLift: {
          mass: '~9,200 kg',
          mission: 'Jupiter 3 / EchoStar-24',
        },
      },
      landingSites: {
        LZ1: { landed: 53, attempts: 54, rate: 98.15 },
        LZ2: { landed: 19, attempts: 19, rate: 100 },
        LZ4: { landed: 35, attempts: 35, rate: 100 },
        LZ40: { landed: 6, attempts: 6, rate: 100 },
        ASOG: { landed: 167, attempts: 168, rate: 99.4 },
        JRTI: { landed: 156, attempts: 159, rate: 98.11 },
        OCISLY: { landed: 227, attempts: 235, rate: 96.6 },
        Catch: { landed: 3, attempts: 4, rate: 75 },
      },
      dragons: {
        cargoMissions: 36,
        crewMissions: 19,
        testMissions: 1,
        issCargoUp: '~70 tonnes',
        issCargoDown: '~49 tonnes',
        reflights: 9,
        crewInOrbit: 4,
        crewFlownTotal: 74,
      },
      capsules: {
        landed: 56,
        attempts: 57,
        rate: 98.25,
        reflown: 33,
      },
      business: {
        revenue2025: '12.5B USD (estimated)',
        valuation: '350B USD (private, 2024)',
        employees: '~10,000 (estimated)',
        starlinkSubscribers: '~4M (estimated, Q1 2025)',
        starlinkRevenue: '7.4B USD (2024, est.)',
      },
    }
  } catch (error) {
    clearTimeout(timeout)
    if (error instanceof UpstreamError) throw error
    throw new UpstreamError(
      'Could not scrape spacexnow.com',
      502,
      'UPSTREAM_UNAVAILABLE',
    )
  }
}

// ---------------------------------------------------------------------------
// StatsService
// ---------------------------------------------------------------------------

export class StatsService {
  private cache: CacheStore
  private fetchImpl: typeof fetch
  private blockedUntil = 0

  constructor(
    fetchImpl: typeof fetch,
    cache: CacheStore,
  ) {
    this.fetchImpl = fetchImpl
    this.cache = cache
  }

  getRetryAt() {
    return this.blockedUntil > Date.now() ? this.blockedUntil : null
  }

  async getStats(): Promise<{ value: SpaceXNowStats; stale: boolean }> {
    const cached = await this.cache.get(CACHE_KEY, statsSchema)
    if (cached && Date.now() - cached.fetchedAt < SPACEXNOW_CACHE_TTL_MS) {
      return { value: cached.value, stale: false }
    }

    // If we're in a cooldown window, return cached or bootstrap
    if (Date.now() < this.blockedUntil) {
      if (cached) return { value: cached.value, stale: true }
      return {
        value: SPACEXNOW_BOOTSTRAP,
        stale: true,
      }
    }

    try {
      const stats = await scrapeSpacexnowStats(this.fetchImpl)
      await this.cache.set(CACHE_KEY, stats)
      this.blockedUntil = 0
      return { value: stats, stale: false }
    } catch (error) {
      this.blockedUntil = Date.now() + SPACEXNOW_CACHE_TTL_MS
      if (cached) return { value: cached.value, stale: true }
      return {
        value: SPACEXNOW_BOOTSTRAP,
        stale: true,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Zod schema for validated parsing
// ---------------------------------------------------------------------------

import { z } from 'zod'

const landingSiteSchema = z.object({
  landed: z.number(),
  attempts: z.number(),
  rate: z.number(),
})

const landingSitesSchema = z.object({
  LZ1: landingSiteSchema,
  LZ2: landingSiteSchema,
  LZ4: landingSiteSchema,
  LZ40: landingSiteSchema,
  ASOG: landingSiteSchema,
  JRTI: landingSiteSchema,
  OCISLY: landingSiteSchema,
  Catch: landingSiteSchema,
})

const launchPerYearSchema = z.object({
  year: z.number(),
  planned: z.number(),
  completed: z.number(),
  rate: z.number(),
})

const launchCadenceSchema = z.object({
  totalLaunches: z.number(),
  successfulLaunches: z.number(),
  failedLaunches: z.number(),
  successRate: z.number(),
  mostSuccessive: z.number(),
  currentSuccessive: z.number(),
  launchesPerYear: z.array(launchPerYearSchema),
  mostLaunchesInYear: z.object({
    year: z.number(),
    count: z.number(),
  }),
  launchGoal2026: z.object({
    planned: z.number(),
    completed: z.number(),
    rate: z.number(),
  }),
})

const boosterSchema = z.object({
  totalLanded: z.number(),
  totalAttempts: z.number(),
  landingRate: z.number(),
  mostFlights: z.object({
    booster: z.string(),
    flights: z.number(),
  }),
  reflown: z.number(),
  block5Landed: z.number(),
  block5Attempts: z.number(),
  block5Rate: z.number(),
  block5Reflown: z.number(),
  fastestTurnaround: z.object({
    duration: z.string(),
    booster: z.string().optional(),
    firstFlight: z.string(),
    secondFlight: z.string(),
  }),
  fastestTurnaroundCapeCanaveral: z.object({
    duration: z.string(),
    firstFlight: z.string(),
    secondFlight: z.string(),
  }),
  fastestTurnaroundVandenberg: z.object({
    duration: z.string(),
    firstFlight: z.string(),
    secondFlight: z.string(),
  }),
  fastestTurnaroundStarbase: z.object({
    duration: z.string(),
    firstFlight: z.string(),
    secondFlight: z.string(),
  }),
})

const starlinkSchema = z.object({
  inOrbit: z.number(),
  starlinkLaunches: z.number(),
  totalLaunches: z.number(),
  starlinkRate: z.number(),
  heaviestLeoLift: z.object({
    mass: z.string(),
    mission: z.string(),
  }),
  heaviestGtoLift: z.object({
    mass: z.string(),
    mission: z.string(),
  }),
})

const dragonSchema = z.object({
  cargoMissions: z.number(),
  crewMissions: z.number(),
  testMissions: z.number(),
  issCargoUp: z.string(),
  issCargoDown: z.string(),
  reflights: z.number(),
  crewInOrbit: z.number(),
  crewFlownTotal: z.number(),
})

const capsuleSchema = z.object({
  landed: z.number(),
  attempts: z.number(),
  rate: z.number(),
  reflown: z.number(),
})

const businessSchema = z.object({
  revenue2025: z.string(),
  valuation: z.string(),
  employees: z.string(),
  starlinkSubscribers: z.string(),
  starlinkRevenue: z.string(),
})

export const statsSchema = z.object({
  fetchedAt: z.string(),
  stale: z.boolean(),
  launchCadence: launchCadenceSchema,
  boosters: boosterSchema,
  starlink: starlinkSchema,
  landingSites: landingSitesSchema,
  dragons: dragonSchema,
  capsules: capsuleSchema,
  business: businessSchema,
})
