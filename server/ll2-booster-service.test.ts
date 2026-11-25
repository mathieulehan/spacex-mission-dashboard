import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CacheStore } from './cache-store.js'
import {
  LL2BoosterService,
  boosterListItemSchema,
  ll2BoosterStatsSchema,
  mapBoosterStatus,
  toBoosterListItem,
  type LL2Launcher,
} from './ll2-booster-service.js'
import { scrapeSpacexnowStats, StatsService, statsSchema } from './stats.js'
import { SPACEXNOW_BOOTSTRAP, type BoosterStats } from './stats-snapshot.js'

// Aucun appel réseau : toutes les réponses LL2 viennent de ces fixtures.
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'server/fixtures', name), 'utf8'))
const PAGE_1 = fixture('ll2-launchers-page1.json')
const PAGE_2 = fixture('ll2-launchers-page2.json')
const LANDINGS = fixture('ll2-landings-boosters.json')
const SPACEXNOW_HTML = readFileSync(
  resolve(process.cwd(), 'server/fixtures/spacexnow-stats.html'),
  'utf8',
)

const LAUNCHERS_URL = 'https://ll.thespacedevs.com/2.2.0/launcher/?mode=detailed&limit=100'

type MemoryCache = CacheStore & { entries: Map<string, unknown> }

function memoryCache(): MemoryCache {
  const entries = new Map<string, unknown>()
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

function ll2Fetch(options: { launchersStatus?: number } = {}): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/launcher/')) {
      if (options.launchersStatus && options.launchersStatus !== 200) {
        return new Response('rate limited', { status: options.launchersStatus })
      }
      return new Response(JSON.stringify(url.includes('offset=100') ? PAGE_2 : PAGE_1), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('/landings/')) {
      return new Response(JSON.stringify(LANDINGS), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

describe('liste des boosters LL2', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('paginate les 2 pages et ne garde que les Falcon 9 (filtre name strict)', async () => {
    const fetchMock = ll2Fetch()
    const service = new LL2BoosterService(fetchMock as unknown as typeof fetch, memoryCache())

    const { value, stale } = await service.getBoosterStats()

    expect(stale).toBe(false)
    const launcherCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/launcher/'))
    expect(launcherCalls).toEqual([
      LAUNCHERS_URL,
      'https://ll.thespacedevs.com/2.2.0/launcher/?mode=detailed&limit=100&offset=100',
    ])
    expect(value.list).toHaveLength(7)
    const serials = (value.list ?? []).map((item) => item.serialNumber)
    expect(serials).toEqual([
      'B1067',
      'B1061',
      'B1058',
      'B1056',
      'B1047',
      'B1023',
      'B1005',
    ])
    expect(serials).not.toContain('FH-1') // Falcon Heavy
    expect(serials).not.toContain('B1099') // launcher_config.name = "Falcon 9 Block 5"
    expect(serials).not.toContain('') // serial_number vide
  })

  it('mappe les champs et tous les statuts LL2 vers le contrat UI', async () => {
    const service = new LL2BoosterService(
      ll2Fetch() as unknown as typeof fetch,
      memoryCache(),
    )
    const { value } = await service.getBoosterStats()
    const list = value.list ?? []
    const bySerial = (serial: string) => list.find((item) => item.serialNumber === serial)

    expect(bySerial('B1067')).toEqual({
      serialNumber: 'B1067',
      type: 'Falcon 9 Block 5',
      flights: 37,
      landed: 36,
      attempted: 37,
      landingRate: 97.3,
      status: 'active',
      lastFlight: '2026-11-20T12:00:00Z',
    })
    expect(bySerial('B1061')?.status).toBe('lost')
    expect(bySerial('B1058')).toMatchObject({
      type: 'Falcon 9 Block 5',
      status: 'retired', // objet { name: "Expended" }
      landingRate: 84.21,
    })
    expect(bySerial('B1056')).toMatchObject({ status: 'lost', landingRate: 0 }) // destroyed
    expect(bySerial('B1047')?.status).toBe('retired') // scrapped
    expect(bySerial('B1023')).toMatchObject({ status: 'retired', type: 'Falcon 9' }) // converted
    expect(bySerial('B1005')).toMatchObject({ status: 'retired', type: 'FT' }) // full_name null
    expect(boosterListItemSchema.array().safeParse(list).success).toBe(true)

    // Mapping direct des synonymes, y compris un statut inattendu.
    for (const status of ['lost', 'destroyed']) expect(mapBoosterStatus(status)).toBe('lost')
    for (const status of ['retired', 'expended', 'scrapped', 'converted']) {
      expect(mapBoosterStatus(status)).toBe('retired')
    }
    expect(mapBoosterStatus('Active')).toBe('active')
    expect(mapBoosterStatus(null)).toBe('retired')
  })

  it('ne divise jamais par zéro et ignore les launchers sans serial', () => {
    const launcher = (serial: string | null, landed: number, attempted: number) =>
      ({
        serial_number: serial,
        status: 'Active',
        flights: 0,
        successful_landings: landed,
        attempted_landings: attempted,
        last_launch_date: null,
        launcher_config: { id: 164, name: 'Falcon 9', full_name: 'Falcon 9', variant: null },
      }) as LL2Launcher

    expect(toBoosterListItem(launcher('B1', 0, 0))).toMatchObject({
      landed: 0,
      attempted: 0,
      landingRate: 0,
      lastFlight: '',
    })
    expect(toBoosterListItem(launcher(null, 3, 3))).toBeNull()
    const partial = toBoosterListItem({
      ...launcher('B2', 3, 3),
      successful_landings: null,
      attempted_landings: null,
      flights: null,
    })
    expect(partial).toMatchObject({ landingRate: 0, landed: 0, attempted: 0, flights: 0 })
  })

  it('garde les agrégats existants intacts et sert la liste depuis le cache 1h', async () => {
    const fetchMock = ll2Fetch()
    const cache = memoryCache()
    const service = new LL2BoosterService(fetchMock as unknown as typeof fetch, cache)

    const first = await service.getBoosterStats()
    expect(first.value).toMatchObject({
      totalLanded: 2,
      totalAttempts: 2,
      landingRate: 100,
      mostFlights: { booster: 'B1067', flights: 37 },
      reflown: 2,
    })

    // Le cache est relu via ll2BoosterStatsSchema : le sous-schéma `list`
    // doit être conservé, sinon la section Boosters disparaît au 2e appel.
    const cached = await cache.get('ll2:booster-stats', ll2BoosterStatsSchema)
    expect(cached?.value.list).toHaveLength(7)

    const second = await service.getBoosterStats()
    expect(second.stale).toBe(false)
    expect(second.value.list).toEqual(first.value.list)
    expect(fetchMock).toHaveBeenCalledTimes(3) // 1 landing + 2 launchers, une seule fois
  })

  it('échoue sans liste quand LL2 est indisponible (429)', async () => {
    const fetchMock = ll2Fetch({ launchersStatus: 429 })
    const service = new LL2BoosterService(fetchMock as unknown as typeof fetch, memoryCache())

    const { value, stale } = await service.getBoosterStats()

    expect(stale).toBe(true)
    expect(value.list).toBeUndefined()
    expect(value.totalLanded).toBe(SPACEXNOW_BOOTSTRAP.boosters.totalLanded)
    expect(service.getRetryAt()).not.toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ll2_boosters_dated_fallback'))
  })
})

describe('propagation de la liste dans /api/stats', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  const freshList = () => boosterListItemSchema.array().parse([
    {
      serialNumber: 'B1067',
      type: 'Falcon 9 Block 5',
      flights: 37,
      landed: 36,
      attempted: 37,
      landingRate: 97.3,
      status: 'active',
      lastFlight: '2026-11-20T12:00:00Z',
    },
  ])

  // Les agrégats LL2 doivent rester cohérents avec les landingSites live,
  // sinon les invariants /api/stats rejettent le remplacement (comportement
  // préexistant, hors périmètre de cette liste).
  const freshLl2Stub = (boosters: BoosterStats, list: ReturnType<typeof freshList> | undefined) =>
    ({
      getBoosterStats: vi.fn(async () => ({
        value: { ...boosters, ...(list ? { list } : {}) },
        stale: false,
      })),
      getRetryAt: () => null,
    }) as unknown as LL2BoosterService

  const statsFetch = () =>
    vi.fn(async () =>
      new Response(SPACEXNOW_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ) as unknown as typeof fetch

  it('traverse statsSchema et le cache sans être supprimée par Zod', async () => {
    const cache = memoryCache()
    const live = await scrapeSpacexnowStats(
      (async () =>
        new Response(SPACEXNOW_HTML, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })) as unknown as typeof fetch,
    )
    const service = new StatsService(statsFetch(), cache, freshLl2Stub(live.boosters, freshList()))

    const first = await service.getStats()
    expect(first.value.boosters.list).toEqual(freshList())
    expect(first.value.boosters.totalAttempts).toBe(live.boosters.totalAttempts)

    // Lecture du cache : c'est ici que Zod supprimait la clé `list`.
    const cached = await cache.get('spacexnow:stats', statsSchema)
    expect(cached?.value.boosters.list).toEqual(freshList())

    const second = await service.getStats()
    expect(second.value.boosters.list).toEqual(freshList())
    expect(statsSchema.safeParse(second.value).success).toBe(true)
  })

  it('laisse la section sans liste quand LL2 échoue, sans planter', async () => {
    const ll2 = new LL2BoosterService(
      ll2Fetch({ launchersStatus: 429 }) as unknown as typeof fetch,
      memoryCache(),
    )
    const service = new StatsService(statsFetch(), memoryCache(), ll2)

    const result = await service.getStats()

    expect(result.stale).toBe(false)
    expect(result.value.boosters.list).toBeUndefined()
    expect(result.value.boosters.totalAttempts).toBe(704)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ll2_boosters_stale_ignored'))
  })
})
