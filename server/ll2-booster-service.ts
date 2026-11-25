import type { CacheStore } from './cache-store.js'
import { UpstreamError } from './upstream.js'
import {
  SPACEXNOW_BOOTSTRAP,
  SPACEXNOW_BOOTSTRAP_FETCHED_AT,
  rateOf,
  type BoosterListItem,
  type BoosterStats,
} from './stats-snapshot.js'

const LL2_BASE_URL = 'https://ll.thespacedevs.com/2.2.0'
const LL2_LANDINGS_CACHE_TTL = 60 * 60 * 1_000 // 1 heure
const LL2_BOOSTER_LIST_CACHE_KEY = 'll2:booster-list'

// UNIQUE snapshot de secours des boosters : partagé avec /api/stats.
// Jamais présenté comme live par StatsService, qui ignore ce retour obsolète
// quand le scrape spacexnow réussit.
const LL2_BOOTSTRAP_FETCHED_AT = SPACEXNOW_BOOTSTRAP_FETCHED_AT
const LL2_BOOTSTRAP_BOOSTERS: BoosterStats = SPACEXNOW_BOOTSTRAP.boosters

export class LL2BoosterService {
  private cache: CacheStore
  private fetchImpl: typeof fetch
  private blockedUntil = 0
  private listBlockedUntil = 0
  private listInFlight: Promise<BoosterListItem[] | null> | null = null

  constructor(fetchImpl: typeof fetch, cache: CacheStore) {
    this.fetchImpl = fetchImpl
    this.cache = cache
  }

  getRetryAt() {
    return this.blockedUntil > Date.now() ? this.blockedUntil : null
  }

  /**
   * Roster des boosters : endpoint /launcher (2 pages) avec SON PROPRE cache
   * et SON PROPRE cooldown. Il ne dépend pas des 19 pages de /landings/ :
   * une erreur 429 sur les landings ne peut donc pas faire disparaître la
   * liste. En échec, on ne renvoie que du déjà vu (cache ou rien), jamais une
   * liste fabriquée.
   */
  async getBoosterList(): Promise<BoosterListItem[] | null> {
    const cached = await this.cache.get(
      LL2_BOOSTER_LIST_CACHE_KEY,
      boosterListItemSchema.array(),
    )
    if (cached && Date.now() - cached.fetchedAt < LL2_LANDINGS_CACHE_TTL) {
      return cached.value
    }
    if (this.listInFlight) return this.listInFlight
    if (Date.now() < this.listBlockedUntil) return cached?.value ?? null

    this.listInFlight = this.fetchBoosterList()
      .then(async (list) => {
        this.listBlockedUntil = 0
        await this.cache.set(LL2_BOOSTER_LIST_CACHE_KEY, list)
        return list
      })
      .catch((error) => {
        this.listBlockedUntil = Date.now() + LL2_LANDINGS_CACHE_TTL
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'll2_booster_list_unavailable',
          reason: error instanceof Error ? error.message : String(error),
        }))
        return cached?.value ?? null
      })
      .finally(() => {
        this.listInFlight = null
      })

    return this.listInFlight
  }

  private async withBoosterList(stats: LL2BoosterStats): Promise<LL2BoosterStats> {
    const list = await this.getBoosterList()
    return list && list.length > 0 ? { ...stats, list } : stats
  }

  async getBoosterStats(): Promise<{ value: LL2BoosterStats; stale: boolean }> {
    const cached = await this.cache.get('ll2:booster-stats', ll2BoosterStatsSchema)
    if (cached && Date.now() - cached.fetchedAt < LL2_LANDINGS_CACHE_TTL) {
      return { value: await this.withBoosterList(cached.value), stale: false }
    }

    if (Date.now() < this.blockedUntil) {
      if (cached) return { value: await this.withBoosterList(cached.value), stale: true }
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'll2_boosters_dated_fallback',
        asOf: LL2_BOOTSTRAP_FETCHED_AT,
        reason: 'LL2 cooldown active; serving the dated bootstrap',
      }))
      return { value: await this.withBoosterList(LL2_BOOTSTRAP_BOOSTERS), stale: true }
    }

    try {
      const stats = await this.fetchAndComputeBoosterStats()
      const withList = await this.withBoosterList(stats)
      await this.cache.set('ll2:booster-stats', withList)
      this.blockedUntil = 0
      return { value: withList, stale: false }
    } catch (error) {
      this.blockedUntil = Date.now() + LL2_LANDINGS_CACHE_TTL
      if (cached) return { value: await this.withBoosterList(cached.value), stale: true }
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'll2_boosters_dated_fallback',
        asOf: LL2_BOOTSTRAP_FETCHED_AT,
        reason: error instanceof Error ? error.message : String(error),
      }))
      return { value: await this.withBoosterList(LL2_BOOTSTRAP_BOOSTERS), stale: true }
    }
  }

  private async fetchAndComputeBoosterStats(): Promise<LL2BoosterStats> {
    // UNIQUE source des agrégats : les landings LL2. Le roster /launcher est
    // désormais chargé par getBoosterList() (cache propre), pour que sa
    // disponibilité ne dépende pas des 19 pages de /landings/.
    const allLandings = await this.fetchAllLandings()

    // Filtrer les landings Falcon 9
    const f9Landings = allLandings.filter((l) => l.firststage?.launcher?.id === 8)

    if (f9Landings.length === 0) {
      throw new UpstreamError(
        'Aucune landing Falcon 9 trouvée dans LL2',
        502,
        'LL2_NO_F9_LANDINGS',
      )
    }

    // Calculer les stats
    let totalAttempts = 0
    let totalLanded = 0
    const boosterFlights = new Map<string, { flights: number; attempts: number; landings: number; turnarounds: number[] }>()

    for (const landing of f9Landings) {
      const serial = landing.firststage?.launcher?.serial_number
      const launcher = landing.firststage?.launcher
      if (!serial || !launcher) continue

      if (!boosterFlights.has(serial)) {
        boosterFlights.set(serial, {
          flights: launcher.flights || 0,
          attempts: 0,
          landings: 0,
          turnarounds: [],
        })
      }

      const b = boosterFlights.get(serial)!

      if (landing.attempt) {
        totalAttempts++
        if (landing.success) {
          totalLanded++
          b.landings++
        }
        b.attempts++
      }

      if (landing.firststage?.turn_around_time_days != null && landing.firststage.turn_around_time_days > 0) {
        b.turnarounds.push(landing.firststage.turn_around_time_days)
      }
    }

    const landingRate = totalAttempts > 0 ? (totalLanded / totalAttempts) * 100 : 0

    // Booster avec le plus de flights
    let mostFlights = { booster: '', flights: 0 }
    for (const [serial, data] of boosterFlights) {
      if (data.flights > mostFlights.flights) {
        mostFlights = { booster: serial, flights: data.flights }
      }
    }

    // Boosters reflown (plus d'un vol)
    const reflown = [...boosterFlights.values()].filter((b) => b.flights > 1).length

    // Block 5 stats
    let block5Landed = 0
    let block5Attempts = 0
    let block5Reflown = 0
    for (const [serial, data] of boosterFlights) {
      if (serial.startsWith('B10')) {
        block5Attempts += data.attempts
        block5Landed += data.landings
        if (data.flights > 1) block5Reflown++
      }
    }
    const block5Rate = block5Attempts > 0 ? (block5Landed / block5Attempts) * 100 : 0

    // Fastest turnaround
    let minDays = Infinity
    let fastestBooster = ''
    let fastestBoosterTurnaround = LL2_BOOTSTRAP_BOOSTERS.fastestBoosterTurnaround

    for (const [serial, data] of boosterFlights) {
      for (const days of data.turnarounds) {
        if (days < minDays) {
          minDays = days
          fastestBooster = serial
        }
      }
    }

    if (minDays !== Infinity) {
      const days = Math.floor(minDays)
      const hours = Math.round((minDays - days) * 24)
      fastestBoosterTurnaround = {
        duration: hours > 0 ? `${days} days, ${hours} hours` : `${days} days`,
        booster: fastestBooster,
        firstFlight: 'voir LL2 pour les détails',
        secondFlight: 'voir LL2 pour les détails',
      }
    }

    return {
      totalLanded,
      totalAttempts,
      landingRate,
      mostFlights,
      reflown,
      block5Landed,
      block5Attempts,
      block5Rate,
      block5Reflown,
      fastestBoosterTurnaround,
      fastestPadTurnaround: LL2_BOOTSTRAP_BOOSTERS.fastestPadTurnaround,
      fastestPadTurnaroundCapeCanaveral: LL2_BOOTSTRAP_BOOSTERS.fastestPadTurnaroundCapeCanaveral,
      fastestPadTurnaroundVandenberg: LL2_BOOTSTRAP_BOOSTERS.fastestPadTurnaroundVandenberg,
      fastestPadTurnaroundStarbase: LL2_BOOTSTRAP_BOOSTERS.fastestPadTurnaroundStarbase,
    }
  }

  private async fetchBoosterList(): Promise<BoosterListItem[]> {
    // Le filtre query launcher_config__id=164 est ignoré en 2.2.0 : on filtre ici.
    const launchers = await this.fetchAllLaunchers()
    return launchers
      .filter((launcher) => launcher.launcher_config?.name === 'Falcon 9')
      .map(toBoosterListItem)
      .filter((item): item is BoosterListItem => item !== null)
  }

  private async fetchAllLaunchers(): Promise<Array<LL2Launcher>> {
    const allLaunchers: Array<LL2Launcher> = []
    let next: string | null = `${LL2_BASE_URL}/launcher/?mode=detailed&limit=100`

    while (next) {
      const response = await this.fetchImpl(next, {
        headers: { accept: 'application/json' },
      })

      if (!response.ok) {
        throw new UpstreamError(
          `LL2 returned ${response.status}`,
          502,
          'LL2_RESPONSE_ERROR',
          response.status,
        )
      }

      const data = (await response.json()) as LL2LaunchersResponse
      allLaunchers.push(...data.results)
      next = data.next
    }

    return allLaunchers
  }

  private async fetchAllLandings(): Promise<Array<LL2Landing>> {
    const allLandings: Array<LL2Landing> = []
    let next: string | null = `${LL2_BASE_URL}/landings/?format=json&limit=100`

    while (next) {
      const response = await this.fetchImpl(next, {
        headers: { accept: 'application/json' },
      })

      if (!response.ok) {
        throw new UpstreamError(
          `LL2 returned ${response.status}`,
          502,
          'LL2_RESPONSE_ERROR',
          response.status,
        )
      }

      const data = (await response.json()) as LL2LandingsResponse
      allLandings.push(...data.results)
      next = data.next
    }

    return allLandings
  }
}

/** Même contrat que les boosters de /api/stats — aucun modèle parallèle. */
export type LL2BoosterStats = BoosterStats

export interface LL2Landing {
  id: string
  url: string
  attempt: boolean
  success: boolean | null
  description: string
  landing_type: { id: number; name: string; abbrev: string; description: string }
  landing_location: { id: number; name: string; abbrev: string; successful_landings: number }
  firststage: {
    id: number
    type: string
    reused: boolean
    launcher_flight_number: number
    launcher: {
      id: number
      url: string
      details: string
      flight_proven: boolean
      serial_number: string
      status: string
      image_url: string
      successful_landings: number
      attempted_landings: number
      flights: number
      last_launch_date: string
      first_launch_date: string
    }
    previous_flight_date: string | null
    turn_around_time_days: number | null
    previous_flight: unknown | null
  }
  spacecraftflight: unknown | null
}

export interface LL2LandingsResponse {
  count: number
  next: string | null
  previous: string | null
  results: LL2Landing[]
}

export interface LL2Launcher {
  id: number
  serial_number: string | null
  /** Chaîne ou objet `{ name, abbrev }` selon la version de l'API. */
  status: unknown
  flights: number | null
  successful_landings: number | null
  attempted_landings: number | null
  last_launch_date: string | null
  launcher_config: {
    id: number
    name: string
    full_name: string | null
    variant: string | null
  }
}

export interface LL2LaunchersResponse {
  count: number
  next: string | null
  previous: string | null
  results: LL2Launcher[]
}

function statusLabel(status: unknown): string {
  if (typeof status === 'string') return status
  if (status && typeof status === 'object') {
    const candidate = status as { name?: unknown; abbrev?: unknown }
    if (typeof candidate.name === 'string') return candidate.name
    if (typeof candidate.abbrev === 'string') return candidate.abbrev
  }
  return ''
}

/** Statuts LL2 → les trois états du contrat UI, sans valeur inattendue. */
export function mapBoosterStatus(status: unknown): BoosterListItem['status'] {
  switch (statusLabel(status).trim().toLowerCase()) {
    case 'active':
      return 'active'
    case 'lost':
    case 'destroyed':
      return 'lost'
    default:
      // retired, expended, scrapped, converted — et tout statut inconnu.
      return 'retired'
  }
}

function countOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Un launcher sans numéro de série n'est pas une fiche exploitable. */
export function toBoosterListItem(launcher: LL2Launcher): BoosterListItem | null {
  const serialNumber = launcher.serial_number?.trim()
  if (!serialNumber) return null

  const config = launcher.launcher_config
  const landed = countOrZero(launcher.successful_landings)
  const attempted = countOrZero(launcher.attempted_landings)

  return {
    serialNumber,
    type: config?.full_name || config?.variant || config?.name || '',
    flights: countOrZero(launcher.flights),
    landed,
    attempted,
    // Garde-fou : aucun atterrissage tenté ⇒ taux à 0, jamais NaN/Infinity.
    landingRate: rateOf(landed, attempted),
    status: mapBoosterStatus(launcher.status),
    lastFlight: launcher.last_launch_date ?? '',
  }
}

import { z } from 'zod'

/** Sous-schéma partagé avec `boosterSchema` dans stats.ts (cache /api/stats). */
export const boosterListItemSchema = z.object({
  serialNumber: z.string(),
  type: z.string(),
  flights: z.number(),
  landed: z.number(),
  attempted: z.number(),
  landingRate: z.number(),
  status: z.enum(['active', 'retired', 'lost']),
  lastFlight: z.string(),
})

export const ll2BoosterStatsSchema = z.object({
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
  fastestBoosterTurnaround: z.object({
    duration: z.string(),
    booster: z.string().optional(),
    firstFlight: z.string(),
    secondFlight: z.string(),
  }),
  fastestPadTurnaround: z.object({
    duration: z.string(),
    booster: z.string().optional(),
    firstFlight: z.string(),
    secondFlight: z.string(),
  }),
  fastestPadTurnaroundCapeCanaveral: z.object({
    duration: z.string(),
    firstFlight: z.string(),
    secondFlight: z.string(),
  }),
  fastestPadTurnaroundVandenberg: z.object({
    duration: z.string(),
    firstFlight: z.string(),
    secondFlight: z.string(),
  }),
  fastestPadTurnaroundStarbase: z.object({
    duration: z.string(),
    firstFlight: z.string(),
    secondFlight: z.string(),
  }),
  list: z.array(boosterListItemSchema).optional(),
})
