import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CacheStore } from './cache-store.js'
import type { LL2BoosterService } from './ll2-booster-service.js'
import {
  assertStatsInvariants,
  BUSINESS_FALLBACK_AS_OF,
  SPACEXNOW_BOOTSTRAP,
  SPACEXNOW_BOOTSTRAP_FETCHED_AT,
  scrapeSpacexnowStats,
  statsSchema,
  StatsService,
  type BoosterStats,
  type SpaceXNowStats,
} from './stats.js'
import {
  findRow,
  findSection,
  parseCountAndLabel,
  parseFraction,
  parseNumber,
  parseStatsSections,
} from './spacexnow-html.js'

const FIXTURE = readFileSync(
  resolve(process.cwd(), 'server/fixtures/spacexnow-stats.html'),
  'utf8',
)
const NOW = new Date('2026-11-24T12:00:00.000Z')
const CACHE_KEY = 'spacexnow:stats'

function fixtureFetch(html: string = FIXTURE, status = 200): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url !== 'https://spacexnow.com/stats') {
      throw new Error(`Unexpected fetch: ${url}`)
    }
    return new Response(html, {
      status,
      headers: { 'content-type': 'text/html' },
    })
  }) as unknown as typeof fetch
}

function memoryCache(initial?: SpaceXNowStats): CacheStore & { entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>()
  if (initial) {
    entries.set(CACHE_KEY, { value: initial, fetchedAt: Date.parse(initial.fetchedAt) })
  }
  return {
    entries,
    async get(key, schema) {
      const entry = entries.get(key) as { value: unknown; fetchedAt: number } | undefined
      if (!entry) return null
      const parsed = schema.safeParse(entry.value)
      return parsed.success ? { value: parsed.data, fetchedAt: entry.fetchedAt } : null
    },
    async set(key, value, fetchedAt) {
      entries.set(key, { value, fetchedAt: fetchedAt ?? Date.now() })
    },
    async metadata() {
      return []
    },
  }
}

function ll2Stub(stale: boolean, boosters: BoosterStats): LL2BoosterService {
  const service = {
    getBoosterStats: vi.fn(async () => ({ value: boosters, stale })),
    getRetryAt: () => null,
  }
  return service as unknown as LL2BoosterService
}

describe('parseNumber', () => {
  it('handles thousands separators, decimals and percentages', () => {
    expect(parseNumber('11,190')).toBe(11190)
    expect(parseNumber('1,234.56')).toBe(1234.56)
    expect(parseNumber('98.38%')).toBe(98.38)
    expect(parseNumber('98,38')).toBe(98.38)
    expect(parseNumber('643 booster reuses')).toBe(643)
    expect(parseNumber('')).toBe(0)
  })

  it('parses a fraction with an explicit rate', () => {
    expect(parseFraction('728/740 (98.38%)')).toEqual({
      success: 728,
      total: 740,
      rate: 98.38,
    })
    expect(parseCountAndLabel('37 (B1067)')).toEqual({ count: 37, label: 'B1067' })
  })
})

describe('section selection', () => {
  it('finds sections by h3 title rather than table index', () => {
    // Payloads first, Launch Count last : les index du scraper historique
    // (tables[0], tables[3]) seraient tous faux.
    const reordered = FIXTURE.split('<div class="content-box mb-4">')
      .reverse()
      .join('<div class="content-box mb-4">')
    const sections = parseStatsSections(reordered)
    expect(sections.length).toBeGreaterThanOrEqual(10)
    expect(findSection(sections, 'Payloads')?.rows[0]?.label).toBe('Satellites')
    expect(findRow(findSection(sections, 'Launch Count'), 'Total')?.value).toBe('728/740 (98.38%)')
  })
})

describe('scrapeSpacexnowStats with the real HTML fixture', () => {
  it('derives every live aggregate from the fetched page', async () => {
    const stats = await scrapeSpacexnowStats(fixtureFetch(), () => NOW)

    expect(stats.fetchedAt).toBe(NOW.toISOString())
    expect(stats.stale).toBe(false)
    expect(stats.source).toBe('spacexnow')

    expect(stats.launchCadence.totalLaunches).toBe(740)
    expect(stats.launchCadence.successfulLaunches).toBe(728)
    expect(stats.launchCadence.failedLaunches).toBe(12)
    expect(stats.launchCadence.successRate).toBe(98.38)
    expect(stats.launchCadence.mostSuccessive).toBe(355)
    expect(stats.launchCadence.currentSuccessive).toBe(355)
    expect(stats.launchCadence.launchGoal2026).toEqual({
      planned: 145,
      completed: 130,
      rate: 89.66,
    })
    expect(stats.launchCadence.launchesPerYear.find((entry) => entry.year === 2026)).toEqual({
      year: 2026,
      planned: 130,
      completed: 130,
      rate: 100,
    })

    expect(stats.boosters.totalLanded).toBe(681)
    expect(stats.boosters.totalAttempts).toBe(704)
    expect(stats.boosters.landingRate).toBe(96.73)
    expect(stats.boosters.reflown).toBe(643)
    expect(stats.boosters.block5Landed).toBe(657)
    expect(stats.boosters.block5Attempts).toBe(663)
    expect(stats.boosters.block5Rate).toBe(99.1)
    expect(stats.boosters.block5Reflown).toBe(629)
    expect(stats.boosters.mostFlights).toEqual({ booster: 'B1067', flights: 37 })
    // Deux métriques distinctes, désormais sans ambiguïté.
    expect(stats.boosters.fastestBoosterTurnaround.duration).toBe('9 days, 3 hours')
    expect(stats.boosters.fastestBoosterTurnaround.booster).toBe('B1088')
    expect(stats.boosters.fastestPadTurnaround.duration).toBe('38 minutes, 31 seconds')
    expect(stats.boosters.fastestPadTurnaroundCapeCanaveral.duration).toBe('1 day, 21 hours')

    // Exclusions explicites : les 15 lancements des années non listées, et
    // les tentatives de booster non attribuables à un site (Catch = Starship).
    expect(stats.launchCadence.unlistedLaunches).toBe(15)
    expect(stats.landingSitesScope).toEqual({
      excludedFromBoosterTotals: ['Catch'],
      unattributedAttempts: 10,
    })

    expect(stats.starlink.inOrbit).toBe(11190)
    expect(stats.starlink.starlinkLaunches).toBe(432)
    expect(stats.starlink.totalLaunches).toBe(740)
    expect(stats.starlink.heaviestLeoLift).toEqual({
      mass: '~17,500 kg',
      mission: 'Starlink 6-39 (+54 satellites)',
    })

    expect(stats.landingSites).toEqual([
      { site: 'LZ-1', landed: 54, attempts: 55, rate: 98.18 },
      { site: 'LZ-2', landed: 20, attempts: 20, rate: 100 },
      { site: 'LZ-4', landed: 38, attempts: 38, rate: 100 },
      { site: 'LZ-40', landed: 8, attempts: 8, rate: 100 },
      { site: 'ASOG', landed: 168, attempts: 169, rate: 99.41 },
      { site: 'JRTI', landed: 156, attempts: 159, rate: 98.11 },
      { site: 'OCISLY', landed: 237, attempts: 245, rate: 96.73 },
      { site: 'Catch', landed: 4, attempts: 6, rate: 66.67 },
    ])

    expect(stats.capsules).toEqual({
      landed: 58,
      attempts: 59,
      rate: 98.31,
      reflown: 35,
    })
    expect(stats.dragons).toEqual({
      cargoMissions: 37,
      crewMissions: 20,
      testMissions: 1,
      issCargoUp: '~70 tonnes',
      issCargoDown: '~49 tonnes',
      reflights: 9,
      crewInOrbit: 4,
      crewFlownTotal: 78,
    })
    expect(stats.fallbackAsOf).toBe(BUSINESS_FALLBACK_AS_OF)
    expect(statsSchema.safeParse(stats).success).toBe(true)
  })

  it('returns the same values when the page sections are reordered', async () => {
    const reordered = FIXTURE.split('<div class="content-box mb-4">')
      .reverse()
      .join('<div class="content-box mb-4">')
    const stats = await scrapeSpacexnowStats(fixtureFetch(reordered), () => NOW)
    expect(stats.launchCadence.totalLaunches).toBe(740)
    expect(stats.boosters.block5Landed).toBe(657)
    expect(stats.starlink.inOrbit).toBe(11190)
  })

  it('fails loudly when the upstream shape is unusable', async () => {
    await expect(
      scrapeSpacexnowStats(fixtureFetch('<html><body>maintenance</body></html>'), () => NOW),
    ).rejects.toMatchObject({ code: 'UPSTREAM_INVALID_SHAPE' })
    await expect(scrapeSpacexnowStats(fixtureFetch(FIXTURE, 503), () => NOW)).rejects.toMatchObject({
      code: 'UPSTREAM_RESPONSE_ERROR',
    })
  })
})

describe('StatsService', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('serves live data and never overwrites it with a stale LL2 snapshot', async () => {
    const cache = memoryCache()
    const service = new StatsService(
      fixtureFetch(),
      cache,
      ll2Stub(true, SPACEXNOW_BOOTSTRAP.boosters),
    )
    const result = await service.getStats()

    expect(result.stale).toBe(false)
    expect(result.value.source).toBe('spacexnow')
    expect(Date.parse(result.value.fetchedAt)).toBeGreaterThan(Date.now() - 60_000)
    expect(result.value.boosters.totalLanded).toBe(681)
    expect(result.value.boosters.totalAttempts).toBe(704)
    expect(result.value.starlink.inOrbit).toBe(11190)
    expect(result.value.landingSites[0]).toMatchObject({ site: 'LZ-1', landed: 54 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ll2_boosters_stale_ignored'))
  })

  it('falls back with the real snapshot age and a logged reason when upstream fails', async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const service = new StatsService(failingFetch, memoryCache(), ll2Stub(true, SPACEXNOW_BOOTSTRAP.boosters))

    const result = await service.getStats()
    expect(result.stale).toBe(true)
    expect(result.value.stale).toBe(true)
    expect(result.value.source).toBe('fallback')
    expect(result.value.fetchedAt).toBe(SPACEXNOW_BOOTSTRAP_FETCHED_AT)
    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n')
    expect(logged).toContain('spacexnow_stats_upstream_failure')
    expect(logged).toContain('ECONNREFUSED')
  })

  it('serves the last real snapshot as stale after an upstream failure', async () => {
    const live = await scrapeSpacexnowStats(fixtureFetch(), () => NOW)
    const cache = memoryCache(live)
    const failingFetch = vi.fn(async () => new Response('', { status: 502 })) as unknown as typeof fetch
    const service = new StatsService(failingFetch, cache, ll2Stub(true, SPACEXNOW_BOOTSTRAP.boosters))

    const result = await service.getStats()
    expect(result.stale).toBe(true)
    expect(result.value.stale).toBe(true)
    expect(result.value.fetchedAt).toBe(NOW.toISOString())
    expect(result.value.launchCadence.totalLaunches).toBe(740)
    expect(result.value.starlink.inOrbit).toBe(11190)
  })

  it('does not retry during the cooldown window', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const service = new StatsService(fetchImpl, memoryCache(), ll2Stub(true, SPACEXNOW_BOOTSTRAP.boosters))
    await service.getStats()
    await service.getStats()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(service.getRetryAt()).not.toBeNull()
  })
})

describe('assertStatsInvariants — garde-fou du payload /api/stats', () => {
  const clone = () => structuredClone(SPACEXNOW_BOOTSTRAP)

  it('accepte le snapshot de secours et le snapshot live', async () => {
    expect(() => assertStatsInvariants(SPACEXNOW_BOOTSTRAP)).not.toThrow()
    const live = await scrapeSpacexnowStats(fixtureFetch(), () => NOW)
    expect(() => assertStatsInvariants(live)).not.toThrow()
  })

  it('rejette une série en cours plus longue que le record historique', () => {
    const bad = clone()
    bad.launchCadence.currentSuccessive = bad.launchCadence.mostSuccessive + 1
    expect(() => assertStatsInvariants(bad)).toThrow(/currentSuccessive/)
  })

  it('rejette un taux recopié d’un autre bloc', () => {
    const bad = clone()
    bad.launchCadence.mostLaunchesInYear.rate = bad.launchCadence.launchGoal2026.rate // 76.55
    expect(() => assertStatsInvariants(bad)).toThrow(/mostLaunchesInYear\.rate/)
  })

  it('rejette un record annuel qui n’est pas dérivé de launchesPerYear', () => {
    const bad = clone()
    bad.launchCadence.mostLaunchesInYear.planned = 145 // valeur de launchGoal2026
    expect(() => assertStatsInvariants(bad)).toThrow(/mostLaunchesInYear doit être dérivé/)
  })

  it('rejette une somme par année qui n’égale pas le total', () => {
    const bad = clone()
    bad.launchCadence.unlistedLaunches = 0 // 15 lancements non expliqués
    expect(() => assertStatsInvariants(bad)).toThrow(/somme\(par année\)/)
  })

  it('rejette des landingSites incohérents avec les boosters', () => {
    const bad = clone()
    bad.landingSitesScope.unattributedAttempts = 0 // 10 tentatives non expliquées
    expect(() => assertStatsInvariants(bad)).toThrow(/landingSites\.attempts/)
  })

  it('rejette un record de pad global plus lent qu’un record de site', () => {
    const bad = clone()
    bad.boosters.fastestPadTurnaround.duration = '9 days, 3 hours' // record booster, pas pad
    expect(() => assertStatsInvariants(bad)).toThrow(/record global de pad/)
  })

  it('rejette un taux hors de [0, 100]', () => {
    const bad = clone()
    bad.launchCadence.successRate = 176.55
    expect(() => assertStatsInvariants(bad)).toThrow(/successRate doit être dans \[0, 100\]/)
  })
})
