import type { CacheStore } from './cache-store.js'
import { UpstreamError } from './upstream.js'

const LL2_BASE_URL = 'https://ll.thespacedevs.com/2.2.0'
const LL2_LANDINGS_CACHE_TTL = 60 * 60 * 1_000 // 1 heure

// Données de bootstrap (valeurs connues, utilisées si LL2 inaccessible)
const LL2_BOOTSTRAP_BOOSTERS = {
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
}

export class LL2BoosterService {
  private cache: CacheStore
  private fetchImpl: typeof fetch
  private blockedUntil = 0

  constructor(fetchImpl: typeof fetch, cache: CacheStore) {
    this.fetchImpl = fetchImpl
    this.cache = cache
  }

  getRetryAt() {
    return this.blockedUntil > Date.now() ? this.blockedUntil : null
  }

  async getBoosterStats(): Promise<{ value: LL2BoosterStats; stale: boolean }> {
    const cached = await this.cache.get('ll2:booster-stats', ll2BoosterStatsSchema)
    if (cached && Date.now() - cached.fetchedAt < LL2_LANDINGS_CACHE_TTL) {
      return { value: cached.value, stale: false }
    }

    if (Date.now() < this.blockedUntil) {
      if (cached) return { value: cached.value, stale: true }
      return { value: LL2_BOOTSTRAP_BOOSTERS, stale: true }
    }

    try {
      const stats = await this.fetchAndComputeBoosterStats()
      await this.cache.set('ll2:booster-stats', stats)
      this.blockedUntil = 0
      return { value: stats, stale: false }
    } catch (error) {
      this.blockedUntil = Date.now() + LL2_LANDINGS_CACHE_TTL
      if (cached) return { value: cached.value, stale: true }
      return { value: LL2_BOOTSTRAP_BOOSTERS, stale: true }
    }
  }

  private async fetchAndComputeBoosterStats(): Promise<LL2BoosterStats> {
    // Récupérer les landings depuis LL2 (pagination automatique)
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
    let fastestTurnaround = LL2_BOOTSTRAP_BOOSTERS.fastestTurnaround

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
      fastestTurnaround = {
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
      fastestTurnaround,
      fastestTurnaroundCapeCanaveral: LL2_BOOTSTRAP_BOOSTERS.fastestTurnaroundCapeCanaveral,
      fastestTurnaroundVandenberg: LL2_BOOTSTRAP_BOOSTERS.fastestTurnaroundVandenberg,
      fastestTurnaroundStarbase: LL2_BOOTSTRAP_BOOSTERS.fastestTurnaroundStarbase,
    }
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

export type LL2BoosterStats = {
  totalLanded: number
  totalAttempts: number
  landingRate: number
  mostFlights: { booster: string; flights: number }
  reflown: number
  block5Landed: number
  block5Attempts: number
  block5Rate: number
  block5Reflown: number
  fastestTurnaround: {
    duration: string
    booster?: string
    firstFlight: string
    secondFlight: string
  }
  fastestTurnaroundCapeCanaveral: {
    duration: string
    firstFlight: string
    secondFlight: string
  }
  fastestTurnaroundVandenberg: {
    duration: string
    firstFlight: string
    secondFlight: string
  }
  fastestTurnaroundStarbase: {
    duration: string
    firstFlight: string
    secondFlight: string
  }
}

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

import { z } from 'zod'

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
