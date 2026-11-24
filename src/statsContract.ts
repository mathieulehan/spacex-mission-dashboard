/**
 * Contrat unique /api/stats ↔ UI.
 *
 * Le serveur envoie la forme BRUTE (totalLaunches, landed, mostFlights…).
 * L'UI consomme des alias DÉRIVÉS (total, landings, recordFlights…).
 * Ce module est le seul endroit où les deux formes se rencontrent :
 *   - validation Zod du payload réseau (échec bruyant, jamais de NaN silencieux) ;
 *   - normalisation vers la forme canonique consommée par les composants.
 *
 * Aucun composant ne doit lire un champ brut ou bricolé de /api/stats.
 */
import { z } from 'zod'
import type { LaunchPerYear, Stats } from './types'

const finite = z.number().finite()

const yearBucketSchema = z.object({
  year: finite,
  planned: finite.optional(),
  completed: finite.optional(),
  rate: finite.optional(),
})

/** Objectif annuel : pas de `year` dans le payload réel. */
const goalSchema = z.object({
  planned: finite,
  completed: finite,
  rate: finite,
})

const turnaroundSchema = z.object({
  duration: z.string(),
  booster: z.string().optional(),
  firstFlight: z.string(),
  secondFlight: z.string(),
})

const boosterListItemSchema = z.object({
  serialNumber: z.string(),
  type: z.string(),
  flights: finite,
  landed: finite,
  attempted: finite,
  landingRate: finite,
  status: z.enum(['active', 'retired', 'lost']),
  lastFlight: z.string(),
})

/** Forme brute renvoyée par GET /api/stats (miroir du payload réel). */
export const statsApiResponseSchema = z.object({
  fetchedAt: z.string().min(1),
  stale: z.boolean(),
  source: z.enum(['spacexnow', 'api', 'fallback']).optional(),

  launchCadence: z.object({
    totalLaunches: finite,
    successfulLaunches: finite,
    failedLaunches: finite.optional(),
    successRate: finite,
    mostSuccessive: finite.optional(),
    currentSuccessive: finite,
    launchesPerYear: z.array(yearBucketSchema),
    mostLaunchesInYear: yearBucketSchema.optional(),
    launchGoal2026: goalSchema.optional(),
  }),

  boosters: z.object({
    totalLanded: finite,
    totalAttempts: finite,
    landingRate: finite,
    mostFlights: z.object({ booster: z.string(), flights: finite }),
    reflown: finite.optional(),
    block5Landed: finite.optional(),
    block5Attempts: finite.optional(),
    block5Rate: finite.optional(),
    block5Reflown: finite.optional(),
    fastestTurnaround: turnaroundSchema,
    fastestTurnaroundCapeCanaveral: turnaroundSchema,
    fastestTurnaroundVandenberg: turnaroundSchema,
    fastestTurnaroundStarbase: turnaroundSchema,
    /** Absent de la source spacexnow : pas de fiche par booster dans ce cas. */
    list: z.array(boosterListItemSchema).optional(),
  }),

  landingSites: z.array(z.object({
    site: z.string(),
    landed: finite,
    attempts: finite.optional(),
    rate: finite,
  })),

  starlink: z.object({
    inOrbit: finite,
    starlinkLaunches: finite,
    totalLaunches: finite,
    starlinkRate: finite,
    heaviestLeoLift: z.object({ mass: z.string(), mission: z.string() }),
    heaviestGtoLift: z.object({ mass: z.string(), mission: z.string() }),
  }),

  dragons: z.object({
    cargoMissions: finite,
    crewMissions: finite,
    testMissions: finite,
    totalMissions: finite.optional(),
    issCargoUp: z.string(),
    issCargoDown: z.string(),
    reflights: finite,
    crewInOrbit: finite,
    crewFlownTotal: finite,
  }),

  capsules: z.object({
    landed: finite,
    attempts: finite,
    rate: finite,
    reflown: finite,
  }),

  business: z.object({
    revenue2025: z.string(),
    valuation: z.string(),
    employees: z.string(),
    starlinkSubscribers: z.string(),
    starlinkRevenue: z.string(),
  }),
})

export type StatsApiResponse = z.infer<typeof statsApiResponseSchema>

type PartialBucket = {
  year?: number
  planned?: number
  completed?: number
  rate?: number
}

/** complète un bucket partiel sans jamais laisser `undefined` dans l'UI. */
function toLaunchPerYear(bucket: PartialBucket | undefined, fallbackYear: number): LaunchPerYear {
  return {
    year: bucket?.year ?? fallbackYear,
    planned: bucket?.planned ?? 0,
    completed: bucket?.completed ?? 0,
    rate: bucket?.rate ?? 0,
  }
}

/**
 * Convertit un payload /api/stats en forme canonique UI.
 * Lève une erreur explicite si un champ requis manque : mieux vaut un état
 * d'erreur visible qu'un « NaN » silencieux dans les compteurs.
 */
export function normalizeStats(raw: unknown): Stats {
  const parsed = statsApiResponseSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join(' | ')
    throw new Error(`Contrat /api/stats invalide — ${issues}`)
  }

  const payload = parsed.data
  const currentYear = new Date().getUTCFullYear()
  const thisYearEntry = payload.launchCadence.launchesPerYear.find(
    (entry) => entry.year === currentYear,
  )
  const list = payload.boosters.list ?? []
  const active = list.filter((booster) => booster.status === 'active').length

  return {
    fetchedAt: payload.fetchedAt,
    stale: payload.stale,
    source: payload.source,

    launchCadence: {
      ...payload.launchCadence,
      launchesPerYear: payload.launchCadence.launchesPerYear.map((bucket) =>
        toLaunchPerYear(bucket, currentYear),
      ),
      failedLaunches: payload.launchCadence.failedLaunches ?? 0,
      mostSuccessive:
        payload.launchCadence.mostSuccessive ?? payload.launchCadence.currentSuccessive,
      mostLaunchesInYear: toLaunchPerYear(
        payload.launchCadence.mostLaunchesInYear,
        currentYear,
      ),
      launchGoal2026: toLaunchPerYear(payload.launchCadence.launchGoal2026, currentYear),
      // Alias canoniques dérivés — jamais fournis par l'API brute.
      total: payload.launchCadence.totalLaunches,
      successful: payload.launchCadence.successfulLaunches,
      consecutive: payload.launchCadence.currentSuccessive,
      thisYear:
        thisYearEntry?.completed ??
        payload.launchCadence.launchGoal2026?.completed ??
        0,
    },

    boosters: {
      ...payload.boosters,
      reflown: payload.boosters.reflown ?? 0,
      block5Landed: payload.boosters.block5Landed ?? 0,
      block5Attempts: payload.boosters.block5Attempts ?? 0,
      block5Rate: payload.boosters.block5Rate ?? 0,
      block5Reflown: payload.boosters.block5Reflown ?? 0,
      // Alias canoniques dérivés. `active`/`total` ne sont pas exposés par la
      // source spacexnow : `total` signifie ici « tentatives d'atterrissage ».
      list,
      active,
      total: payload.boosters.totalAttempts,
      recordFlights: payload.boosters.mostFlights.flights,
      recordBooster: payload.boosters.mostFlights.booster,
    },

    landingSites: payload.landingSites.map((site) => ({
      site: site.site,
      landings: site.landed,
      attempts: site.attempts ?? 0,
      rate: site.rate,
    })),

    starlink: payload.starlink,
    dragons: {
      ...payload.dragons,
      totalMissions:
        payload.dragons.totalMissions ??
        payload.dragons.cargoMissions +
          payload.dragons.crewMissions +
          payload.dragons.testMissions,
    },
    capsules: payload.capsules,
    business: payload.business,
  }
}

/** Date du snapshot, au format françaisJJ/MM/AAAA, en UTC. */
export function formatSnapshotDate(fetchedAt: string): string {
  const date = new Date(fetchedAt)
  if (Number.isNaN(date.getTime())) return 'date inconnue'
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Libellé de provenance : un snapshot de secours est toujours annoncé comme
 * tel, et on ne cite The Space Devs que si l'API le déclare explicitement.
 */
export function statsSourceLabel(data: Stats): string {
  const date = formatSnapshotDate(data.fetchedAt)
  if (data.stale || data.source === 'fallback') {
    return `Instantané de secours du ${date}.`
  }
  if (data.source === 'api') {
    return `Données mises à jour depuis l'API The Space Devs le ${date}.`
  }
  if (data.source === 'spacexnow') {
    return `Données spacexnow du ${date}.`
  }
  return `Données mises à jour le ${date}.`
}
