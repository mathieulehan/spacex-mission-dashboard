import { describe, expect, it } from 'vitest'
import rawStats from './test/fixtures/stats-api.json'
import { formatSnapshotDate, normalizeStats, statsSourceLabel } from './statsContract'

describe('normalizeStats — contrat /api/stats ↔ UI', () => {
  it("mappe le payload réel vers les alias consommés par l'UI", () => {
    const stats = normalizeStats(rawStats)

    expect(stats.launchCadence.total).toBe(721) // totalLaunches
    expect(stats.launchCadence.successful).toBe(709) // successfulLaunches
    expect(stats.launchCadence.consecutive).toBe(338) // currentSuccessive
    expect(stats.launchCadence.thisYear).toBe(111) // launchesPerYear[2026].completed
    expect(stats.landingSites[0]).toMatchObject({
      site: 'LZ1',
      landings: 53, // landed
      rate: 98.15,
    })
    expect(stats.boosters.recordFlights).toBe(37) // mostFlights.flights
    expect(stats.boosters.recordBooster).toBe('B1067') // mostFlights.booster
    expect(stats.boosters.totalLanded).toBe(663)
    expect(stats.boosters.totalAttempts).toBe(686)
    // Aucune fiche booster n'est fournie par spacexnow : jamais de undefined.
    expect(stats.boosters.list).toEqual([])
    expect(stats.boosters.active).toBe(0)
  })

  it('conserve les taux avec deux décimales (pas d’arrondi entier)', () => {
    const stats = normalizeStats(rawStats)
    expect(stats.launchCadence.successRate).toBe(98.34)
    expect(stats.boosters.landingRate).toBe(96.65)
    expect(stats.landingSites[0].rate).toBe(98.15)
    expect(stats.landingSites[3].rate).toBe(100)
  })

  it('propage stale / fetchedAt et n’attribue pas la source à The Space Devs', () => {
    const stats = normalizeStats(rawStats)
    expect(stats.stale).toBe(true)
    expect(stats.fetchedAt).toBe('2026-09-20T12:00:00.000Z')
    expect(formatSnapshotDate(stats.fetchedAt)).toBe('20/09/2026')
    expect(statsSourceLabel(stats)).toBe('Instantané de secours du 20/09/2026.')
    expect(statsSourceLabel(stats)).not.toContain('The Space Devs')
  })

  it('cite The Space Devs uniquement quand la source le déclare', () => {
    const stats = normalizeStats({ ...rawStats, stale: false, source: 'api' })
    expect(statsSourceLabel(stats)).toContain('The Space Devs')
  })

  it('échoue bruyamment si un champ requis manque', () => {
    const broken = structuredClone(rawStats) as unknown as {
      launchCadence: Record<string, unknown>
    }
    delete broken.launchCadence.currentSuccessive
    expect(() => normalizeStats(broken)).toThrow(
      /Contrat \/api\/stats invalide — launchCadence\.currentSuccessive/,
    )
  })

  it('échoue si la forme brute des sites change (landings au lieu de landed)', () => {
    const broken = structuredClone(rawStats) as unknown as {
      landingSites: Record<string, unknown>[]
    }
    broken.landingSites[0] = { site: 'LZ1', landings: 53, rate: 98.15 }
    expect(() => normalizeStats(broken)).toThrow(/landingSites\.0\.landed/)
  })

  it('accepte les noms canoniques du nouveau contrat et garde les alias UI', () => {
    const canonical = structuredClone(rawStats) as Record<string, unknown>
    const cadence = canonical.launchCadence as Record<string, unknown>
    const mapBucket = (entry: Record<string, unknown>): Record<string, unknown> => ({
      ...entry,
      attempts: entry.planned,
      successes: entry.completed,
      rate: entry.rate,
    })
    cadence.launchesPerYear = (cadence.launchesPerYear as Record<string, unknown>[]).map(mapBucket)
    cadence.mostLaunchesInYear = mapBucket(cadence.mostLaunchesInYear as Record<string, unknown>)
    const goal = cadence.launchGoal2026 as Record<string, unknown>
    cadence.launchGoal2026 = {
      ...goal,
      target: goal.planned,
      achieved: goal.completed,
    }
    cadence.unlistedAttempts = 6
    cadence.unlistedSuccesses = 3
    delete cadence.unlistedLaunches

    const stats = normalizeStats(canonical)
    expect(stats.launchCadence.thisYear).toBe(111)
    expect(stats.launchCadence.launchesPerYear[0]).toMatchObject({ planned: 111, completed: 111 })
    expect(stats.launchCadence.launchGoal2026).toMatchObject({
      planned: 145,
      completed: 111,
      rate: 76.55,
    })
    expect(stats.launchCadence.unlistedAttempts).toBe(6)
    expect(stats.launchCadence.unlistedSuccesses).toBe(3)
    // Alias historique = tentatives non listées + échecs des années listées.
    expect(stats.launchCadence.unlistedLaunches).toBe(15)
  })

  it('donne priorité aux noms canoniques sur les alias ambigus', () => {
    const mixed = structuredClone(rawStats) as Record<string, unknown>
    const cadence = mixed.launchCadence as Record<string, unknown>
    const years = cadence.launchesPerYear as Record<string, unknown>[]
    years[0] = { ...years[0], attempts: 111, successes: 111, planned: 999, completed: 999 }
    const goal = cadence.launchGoal2026 as Record<string, unknown>
    cadence.launchGoal2026 = { ...goal, target: 145, achieved: 111, planned: -1, completed: -1 }

    const stats = normalizeStats(mixed)
    expect(stats.launchCadence.thisYear).toBe(111)
    expect(stats.launchCadence.launchGoal2026).toMatchObject({ planned: 145, completed: 111 })
  })
})
