import type { CacheStore } from './cache-store.js'
import { UpstreamError } from './upstream.js'
import { LL2BoosterService } from './ll2-booster-service.js'
import {
  findRow,
  findSection,
  parseCountAndLabel,
  parseFraction,
  parseNumber,
  parseStatsSections,
  type StatsRow,
  type StatsSection,
} from './spacexnow-html.js'
import {
  assertStatsInvariants,
  finalizeStats,
  SPACEXNOW_BOOTSTRAP,
  BUSINESS_FALLBACK_AS_OF,
  SPACEXNOW_STATS_URL,
  type BoosterStats,
  type BoosterFastestTurnaround,
  type CapsuleStats,
  type DragonStats,
  type LaunchCadenceStats,
  type LaunchPerYear,
  type LandingSitesStats,
  type SpaceXNowStats,
  type StarlinkStats,
} from './stats-snapshot.js'

// Ré-export : les consommateurs historiques (tests, app) gardent leurs imports.
export {
  assertStatsInvariants,
  finalizeStats,
  SPACEXNOW_BOOTSTRAP,
  SPACEXNOW_BOOTSTRAP_FETCHED_AT,
  BUSINESS_FALLBACK_AS_OF,
  SPACEXNOW_STATS_URL,
} from './stats-snapshot.js'
export type {
  BoosterStats,
  BoosterFastestTurnaround,
  CapsuleStats,
  DragonStats,
  LaunchCadenceStats,
  LaunchPerYear,
  LandingSiteStats,
  LandingSitesStats,
  SpaceXNowStats,
  StarlinkStats,
} from './stats-snapshot.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPACEXNOW_CACHE_TTL_MS = 60 * 60 * 1_000 // 1 hour – site updates daily at most
const CACHE_KEY = 'spacexnow:stats'

// ---------------------------------------------------------------------------
// Scraper — les tables sont repérées par leur titre <h3>, jamais par index.
// ---------------------------------------------------------------------------

function requireSection(sections: StatsSection[], heading: string): StatsSection {
  const section = findSection(sections, heading)
  if (!section || section.rows.length === 0) {
    throw new UpstreamError(
      `spacexnow.com: section "${heading}" absente ou vide`,
      502,
      'UPSTREAM_INVALID_SHAPE',
    )
  }
  return section
}

function turnaroundFromRow(row: StatsRow | undefined): BoosterFastestTurnaround {
  if (!row) return { duration: '', firstFlight: '', secondFlight: '' }
  const booster = row.value.match(/\(([^)]+)\)\s*$/)
  const between = row.extra?.match(/between\s+(.+?)\s+and\s+(.+)$/i)
  return {
    duration: row.value.replace(/\s*\([^)]*\)\s*$/, '').trim(),
    ...(booster ? { booster: booster[1] } : {}),
    firstFlight: between?.[1]?.trim() ?? '',
    secondFlight: between?.[2]?.trim() ?? '',
  }
}

function buildLaunchCadence(
  launchCount: StatsSection,
  perYear: StatsSection,
  currentYear: number,
): LaunchCadenceStats {
  const total = requireFraction(launchCount, 'Total', 'Launch Count')
  const launchesPerYear = perYear.rows
    .map((row) => {
      const year = Number(row.label)
      if (!Number.isInteger(year) || year < 2000) return null
      const fraction = parseFraction(row.value)
      if (!fraction) return null
      return { year, planned: fraction.total, completed: fraction.success, rate: fraction.rate }
    })
    .filter((entry): entry is LaunchPerYear => entry !== null)
    .sort((a, b) => b.year - a.year)

  if (launchesPerYear.length === 0) {
    throw new UpstreamError(
      'spacexnow.com: aucune année lisible dans "Launches Per Year"',
      502,
      'UPSTREAM_INVALID_SHAPE',
    )
  }

  const goalRow =
    perYear.rows.find(
      (row) => /^launch goal \d{4}$/i.test(row.label) && row.label.includes(String(currentYear)),
    ) ?? perYear.rows.find((row) => /^launch goal \d{4}$/i.test(row.label))
  const goal = goalRow ? parseFraction(goalRow.value) : null
  if (!goal) {
    throw new UpstreamError(
      'spacexnow.com: objectif de lancement introuvable dans "Launches Per Year"',
      502,
      'UPSTREAM_INVALID_SHAPE',
    )
  }

  return {
    totalLaunches: total.total,
    successfulLaunches: total.success,
    failedLaunches: Math.max(0, total.total - total.success),
    successRate: total.rate,
    mostSuccessive: parseNumber(findRow(launchCount, 'Most successive')?.value ?? '0'),
    currentSuccessive: parseNumber(findRow(launchCount, 'Successive')?.value ?? '0'),
    launchesPerYear,
    mostLaunchesInYear: launchesPerYear.reduce((best, entry) =>
      entry.completed > best.completed ? entry : best,
    ),
    launchGoal2026: {
      planned: goal.total,
      completed: goal.success,
      rate: goal.rate,
    },
    // Recalculé par finalizeStats() : total - somme(des années listées).
    unlistedLaunches: 0,
  }
}

function requireFraction(section: StatsSection, label: string, heading: string) {
  const row = findRow(section, label)
  const fraction = row ? parseFraction(row.value) : null
  if (!fraction || fraction.total <= 0) {
    throw new UpstreamError(
      `spacexnow.com: valeur "${label}" introuvable dans "${heading}"`,
      502,
      'UPSTREAM_INVALID_SHAPE',
    )
  }
  return fraction
}

function buildBoosters(boosterSection: StatsSection, turnarounds?: StatsSection): BoosterStats {
  const landed = requireFraction(boosterSection, 'Landed', 'Booster Reuse')
  const block5 = requireFraction(boosterSection, 'Block 5 landed', 'Booster Reuse')
  const mostFlightsRow = findRow(boosterSection, 'Most flights')
  const mostFlights = mostFlightsRow ? parseCountAndLabel(mostFlightsRow.value) : null

  return {
    totalLanded: landed.success,
    totalAttempts: landed.total,
    landingRate: landed.rate,
    mostFlights: { booster: mostFlights?.label ?? '', flights: mostFlights?.count ?? 0 },
    reflown: parseNumber(findRow(boosterSection, 'Reflown')?.value ?? '0'),
    block5Landed: block5.success,
    block5Attempts: block5.total,
    block5Rate: block5.rate,
    block5Reflown: parseNumber(findRow(boosterSection, 'Block 5 reflown')?.value ?? '0'),
    // Deux métriques de nature différente, désormais nommés explicitement.
    fastestBoosterTurnaround: turnaroundFromRow(findRow(turnarounds, 'Booster')),
    fastestPadTurnaround: turnaroundFromRow(findRow(turnarounds, 'Fastest')),
    fastestPadTurnaroundCapeCanaveral: turnaroundFromRow(findRow(turnarounds, 'Cape Canaveral')),
    fastestPadTurnaroundVandenberg: turnaroundFromRow(findRow(turnarounds, 'Vandenberg')),
    fastestPadTurnaroundStarbase: turnaroundFromRow(findRow(turnarounds, 'Starbase')),
  }
}

function buildLandingSites(section: StatsSection): LandingSitesStats {
  const sites = section.rows
    .map((row) => {
      const fraction = parseFraction(row.value)
      return {
        site: row.label,
        landed: fraction?.success ?? 0,
        attempts: fraction?.total ?? 0,
        rate: fraction?.rate ?? 0,
      }
    })
    .filter((site) => site.attempts > 0)
  if (sites.length === 0) {
    throw new UpstreamError(
      'spacexnow.com: aucun site d’atterrissage lisible dans "Landing Sites"',
      502,
      'UPSTREAM_INVALID_SHAPE',
    )
  }
  return sites
}

function buildCapsules(section: StatsSection): CapsuleStats {
  const landed = requireFraction(section, 'Landed', 'Capsule Reuse')
  return {
    landed: landed.success,
    attempts: landed.total,
    rate: landed.rate,
    reflown: parseNumber(findRow(section, 'Reflown')?.value ?? '0'),
  }
}

function buildDragons(section: StatsSection): DragonStats {
  const missions = findRow(section, 'Missions')?.value ?? ''
  const issCargo = findRow(section, 'ISS Cargo')?.value ?? ''
  const numberBefore = (label: string): number =>
    parseNumber(missions.match(new RegExp(`(\\d[\\d,]*)\\s*${label}`, 'i'))?.[1] ?? '0')
  const massMatch = (direction: string): string =>
    issCargo.match(new RegExp(`(~?\\s*\\d[\\d,]*\\s*tonnes?)\\s*${direction}`, 'i'))?.[1]?.trim() ?? ''
  return {
    cargoMissions: numberBefore('Cargo'),
    crewMissions: numberBefore('Crew'),
    testMissions: numberBefore('Test'),
    issCargoUp: massMatch('up'),
    issCargoDown: massMatch('down'),
    reflights: parseNumber(findRow(section, 'Reflights')?.value ?? '0'),
    crewInOrbit: parseNumber(findRow(section, 'Crew in orbit')?.value ?? '0'),
    crewFlownTotal: parseNumber(findRow(section, 'Crew flown total')?.value ?? '0'),
  }
}

function buildStarlink(
  launchCount: StatsSection,
  payloads: StatsSection,
  launchCadence: LaunchCadenceStats,
): StarlinkStats {
  const inOrbitRow = findRow(payloads, 'Starlinks in orbit')
  const inOrbit = parseNumber(inOrbitRow?.value ?? '0')
  if (inOrbit <= 0) {
    throw new UpstreamError(
      'spacexnow.com: "Starlinks in orbit" introuvable dans "Payloads"',
      502,
      'UPSTREAM_INVALID_SHAPE',
    )
  }
  const starlinkRow = findRow(launchCount, 'Starlink')
  const starlinkFraction = starlinkRow ? parseFraction(starlinkRow.value) : null
  const heaviestLeo = findRow(payloads, 'Heaviest LEO')
  const heaviestGto = findRow(payloads, 'Heaviest GTO')
  return {
    inOrbit,
    starlinkLaunches: starlinkFraction?.success ?? 0,
    totalLaunches: launchCadence.totalLaunches,
    starlinkRate: starlinkFraction?.rate ?? 0,
    heaviestLeoLift: {
      mass: heaviestLeo?.value ?? '',
      mission: heaviestLeo?.extra?.replace(/^Flown on\s+/i, '') ?? '',
    },
    heaviestGtoLift: {
      mass: heaviestGto?.value ?? '',
      mission: heaviestGto?.extra?.replace(/^Flown on\s+/i, '') ?? '',
    },
  }
}

export async function scrapeSpacexnowStats(
  fetchImpl: typeof fetch,
  now: () => Date = () => new Date(),
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
    const sections = parseStatsSections(html)
    if (sections.length === 0) {
      throw new UpstreamError(
        'spacexnow.com returned no <h3> statistics section',
        502,
        'UPSTREAM_INVALID_SHAPE',
      )
    }

    const launchCount = requireSection(sections, 'Launch Count')
    const launchCadence = buildLaunchCadence(
      launchCount,
      requireSection(sections, 'Launches Per Year'),
      now().getUTCFullYear(),
    )
    const boosters = buildBoosters(
      requireSection(sections, 'Booster Reuse'),
      findSection(sections, 'Turnarounds'),
    )
    const landingSites = buildLandingSites(requireSection(sections, 'Landing Sites'))
    const capsules = buildCapsules(requireSection(sections, 'Capsule Reuse'))
    const dragons = buildDragons(requireSection(sections, 'Dragon'))
    const payloads = requireSection(sections, 'Payloads')
    const starlink = buildStarlink(launchCount, payloads, launchCadence)

    const result = finalizeStats({
      fetchedAt: now().toISOString(),
      stale: false,
      source: 'spacexnow',
      sourceUrl: SPACEXNOW_STATS_URL,
      // Les seules valeurs non publiées par la source restent datées et
      // explicitement marquées comme telles (jamais présentées comme live).
      fallbackAsOf: BUSINESS_FALLBACK_AS_OF,
      launchCadence,
      boosters,
      starlink,
      landingSites,
      // Catch = Starship, pas un booster landing Falcon 9.
      landingSitesScope: { excludedFromBoosterTotals: ['Catch'], unattributedAttempts: 0 },
      dragons,
      capsules,
      business: SPACEXNOW_BOOTSTRAP.business,
    })
    assertStatsInvariants(result)
    return result
  } catch (error) {
    clearTimeout(timeout)
    if (error instanceof UpstreamError) throw error
    const reason = error instanceof Error ? error.message : String(error)
    throw new UpstreamError(
      `Could not scrape spacexnow.com: ${reason}`,
      502,
      'UPSTREAM_UNAVAILABLE',
    )
  }
}

// ---------------------------------------------------------------------------
// StatsService — toute valeur servie est finalisée puis validée.
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new UpstreamError(`${label} timed out after ${ms}ms`, 504, 'UPSTREAM_TIMEOUT')),
      ms,
    )
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export class StatsService {
  private cache: CacheStore
  private fetchImpl: typeof fetch
  private ll2BoosterService: LL2BoosterService
  private blockedUntil = 0

  constructor(
    fetchImpl: typeof fetch,
    cache: CacheStore,
    ll2BoosterService: LL2BoosterService,
  ) {
    this.fetchImpl = fetchImpl
    this.cache = cache
    this.ll2BoosterService = ll2BoosterService
  }

  getRetryAt() {
    return this.blockedUntil > Date.now() ? this.blockedUntil : null
  }

  private static verified(value: SpaceXNowStats): SpaceXNowStats {
    const finalized = finalizeStats(value)
    assertStatsInvariants(finalized)
    return finalized
  }

  private static asStale(value: SpaceXNowStats): SpaceXNowStats {
    return { ...value, stale: true }
  }

  async getStats(): Promise<{ value: SpaceXNowStats; stale: boolean }> {
    const cached = await this.cache.get(CACHE_KEY, statsSchema)
    if (cached && Date.now() - cached.fetchedAt < SPACEXNOW_CACHE_TTL_MS) {
      return { value: StatsService.verified(cached.value), stale: false }
    }

    // Fenêtre de cooldown : on sert le dernier snapshot réel, jamais une
    // valeur live reconstruite à partir du bootstrap.
    if (Date.now() < this.blockedUntil) {
      if (cached) {
        return { value: StatsService.asStale(StatsService.verified(cached.value)), stale: true }
      }
      return { value: StatsService.asStale(StatsService.verified(SPACEXNOW_BOOTSTRAP)), stale: true }
    }

    try {
      const stats = await scrapeSpacexnowStats(this.fetchImpl)

      // LL2 ne remplace les boosters live que si sa propre réponse est fraîche.
      // Son bootstrap de septembre ne doit jamais écraser un scrape réussi,
      // et un LL2 lent ne doit jamais retarder la réponse live.
      try {
        const ll2 = await withTimeout(this.ll2BoosterService.getBoosterStats(), 5_000, 'LL2 boosters')
        if (ll2.stale) {
          console.warn(JSON.stringify({
            timestamp: new Date().toISOString(),
            event: 'll2_boosters_stale_ignored',
            reason: 'LL2 booster snapshot is stale; keeping live spacexnow boosters',
          }))
        } else {
          stats.boosters = ll2.value
        }
      } catch (ll2Error) {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'll2_boosters_unavailable',
          reason: ll2Error instanceof Error ? ll2Error.message : String(ll2Error),
        }))
      }

      const verified = StatsService.verified(stats)
      await this.cache.set(CACHE_KEY, verified)
      this.blockedUntil = 0
      return { value: verified, stale: false }
    } catch (error) {
      this.blockedUntil = Date.now() + SPACEXNOW_CACHE_TTL_MS
      const reason = error instanceof Error ? error.message : String(error)
      const code = error instanceof UpstreamError ? error.code : 'UPSTREAM_UNAVAILABLE'
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'spacexnow_stats_upstream_failure',
        reason,
        code,
        status: error instanceof UpstreamError ? error.status : 502,
      }))
      if (cached) {
        return { value: StatsService.asStale(StatsService.verified(cached.value)), stale: true }
      }
      return { value: StatsService.asStale(StatsService.verified(SPACEXNOW_BOOTSTRAP)), stale: true }
    }
  }
}

// ---------------------------------------------------------------------------
// Validation Zod — miroir exact du contrat /api/stats.
// ---------------------------------------------------------------------------

import { z } from 'zod'

const turnaroundSchema = z.object({
  duration: z.string(),
  booster: z.string().optional(),
  firstFlight: z.string(),
  secondFlight: z.string(),
})

const landingSitesSchema = z.array(
  z.object({
    site: z.string(),
    landed: z.number(),
    attempts: z.number(),
    rate: z.number(),
  }),
)

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
  mostLaunchesInYear: launchPerYearSchema,
  launchGoal2026: z.object({
    planned: z.number(),
    completed: z.number(),
    rate: z.number(),
  }),
  unlistedLaunches: z.number(),
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
  fastestBoosterTurnaround: turnaroundSchema,
  fastestPadTurnaround: turnaroundSchema,
  fastestPadTurnaroundCapeCanaveral: turnaroundSchema,
  fastestPadTurnaroundVandenberg: turnaroundSchema,
  fastestPadTurnaroundStarbase: turnaroundSchema,
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
  source: z.enum(['spacexnow', 'fallback']),
  sourceUrl: z.string(),
  fallbackAsOf: z.string(),
  launchCadence: launchCadenceSchema,
  boosters: boosterSchema,
  starlink: starlinkSchema,
  landingSites: landingSitesSchema,
  landingSitesScope: z.object({
    excludedFromBoosterTotals: z.array(z.string()),
    unattributedAttempts: z.number(),
  }),
  dragons: dragonSchema,
  capsules: capsuleSchema,
  business: businessSchema,
})
