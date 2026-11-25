/**
 * Contrat unique /api/stats ↔ UI.
 *
 * Le serveur envoie la forme BRUTE (totalLaunches, landed, fastestPadTurnaround…).
 * L'UI consomme des alias DÉRIVÉS (total, landings, recordFlights…).
 * Ce module est le seul endroit où les deux formes se rencontrent :
 *   - validation Zod du payload réseau (échec bruyant, jamais de NaN silencieux) ;
 *   - normalisation vers la forme canonique consommée par les composants ;
 *   - acceptation des anciens noms de champs pour les payloads en cache.
 *
 * Aucun composant ne doit lire un champ brut ou bricolé de /api/stats.
 */
import { z } from 'zod'
import type { LaunchPerYear, Stats } from './types'

const finite = z.number().finite()

type YearBucketInput = {
  year?: number
  attempts?: number
  successes?: number
  target?: number
  achieved?: number
  /** @deprecated alias lu pour les anciens payloads. */
  planned?: number
  /** @deprecated alias lu pour les anciens payloads. */
  completed?: number
  rate?: number
}

const yearBucketSchema = z.object({
  year: finite,
  attempts: finite.optional(),
  successes: finite.optional(),
  planned: finite.optional(),
  completed: finite.optional(),
  rate: finite.optional(),
})

/** Objectif annuel : pas de `year` dans le payload réel. */
const goalSchema = z.object({
  target: finite.optional(),
  achieved: finite.optional(),
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

const emptyTurnaround = () => ({ duration: '', firstFlight: '', secondFlight: '' })

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
  sourceUrl: z.string().optional(),
  fallbackAsOf: z.string().optional(),

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
    /** @deprecated Remplacé par unlistedAttempts / unlistedSuccesses. */
    unlistedLaunches: finite.optional(),
    unlistedAttempts: finite.optional(),
    unlistedSuccesses: finite.optional(),
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
    // Noms explicites : pad (record de piste) vs booster (réutilisation).
    fastestBoosterTurnaround: turnaroundSchema.optional(),
    fastestPadTurnaround: turnaroundSchema.optional(),
    fastestPadTurnaroundCapeCanaveral: turnaroundSchema.optional(),
    fastestPadTurnaroundVandenberg: turnaroundSchema.optional(),
    fastestPadTurnaroundStarbase: turnaroundSchema.optional(),
    // Anciens noms, acceptés pour les snapshots déjà en cache.
    fastestTurnaround: turnaroundSchema.optional(),
    fastestTurnaroundCapeCanaveral: turnaroundSchema.optional(),
    fastestTurnaroundVandenberg: turnaroundSchema.optional(),
    fastestTurnaroundStarbase: turnaroundSchema.optional(),
    /** Absent de la source spacexnow : pas de fiche par booster dans ce cas. */
    list: z.array(boosterListItemSchema).optional(),
  }),

  landingSites: z.array(z.object({
    site: z.string(),
    landed: finite,
    attempts: finite.optional(),
    rate: finite,
  })),
  landingSitesScope: z.object({
    excludedFromBoosterTotals: z.array(z.string()),
    unattributedAttempts: finite,
  }).optional(),

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

/**
 * Complète un bucket partiel sans jamais laisser `undefined` dans l'UI.
 * Les noms canoniques (`attempts`/`successes`, `target`/`achieved`) sont lus
 * en priorité ; `planned`/`completed` ne restent que des alias de compatibilité.
 */
function toLaunchPerYear(bucket: YearBucketInput | undefined, fallbackYear: number): LaunchPerYear {
  return {
    year: bucket?.year ?? fallbackYear,
    planned: bucket?.attempts ?? bucket?.target ?? bucket?.planned ?? 0,
    completed: bucket?.successes ?? bucket?.achieved ?? bucket?.completed ?? 0,
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
  const b = payload.boosters
  const listedAttempts = payload.launchCadence.launchesPerYear.reduce(
    (sum, entry) => sum + (entry.attempts ?? entry.planned ?? 0), 0,
  )
  const listedSuccesses = payload.launchCadence.launchesPerYear.reduce(
    (sum, entry) => sum + (entry.successes ?? entry.completed ?? 0), 0,
  )
  const unlistedAttempts =
    payload.launchCadence.unlistedAttempts ??
    Math.max(0, payload.launchCadence.totalLaunches - listedAttempts)
  const unlistedSuccesses =
    payload.launchCadence.unlistedSuccesses ??
    Math.max(0, payload.launchCadence.successfulLaunches - listedSuccesses)
  // Alias historique : « écart tentatives totales vs succès listés ».
  // 15 = 6 tentatives non listées + 9 échecs des années listées.
  const unlistedLaunches = unlistedAttempts + Math.max(0, listedAttempts - listedSuccesses)

  return {
    fetchedAt: payload.fetchedAt,
    stale: payload.stale,
    source: payload.source,
    sourceUrl: payload.sourceUrl,
    fallbackAsOf: payload.fallbackAsOf,

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
      unlistedLaunches,
      unlistedAttempts,
      unlistedSuccesses,
      // Alias canoniques dérivés — jamais fournis par l'API brute.
      total: payload.launchCadence.totalLaunches,
      successful: payload.launchCadence.successfulLaunches,
      consecutive: payload.launchCadence.currentSuccessive,
      thisYear:
        thisYearEntry?.successes ??
        thisYearEntry?.completed ??
        payload.launchCadence.launchGoal2026?.achieved ??
        payload.launchCadence.launchGoal2026?.completed ??
        0,
    },

    boosters: {
      ...b,
      reflown: b.reflown ?? 0,
      block5Landed: b.block5Landed ?? 0,
      block5Attempts: b.block5Attempts ?? 0,
      block5Rate: b.block5Rate ?? 0,
      block5Reflown: b.block5Reflown ?? 0,
      fastestBoosterTurnaround:
        b.fastestBoosterTurnaround ?? b.fastestTurnaround ?? emptyTurnaround(),
      fastestPadTurnaround:
        b.fastestPadTurnaround ?? b.fastestPadTurnaroundCapeCanaveral ?? emptyTurnaround(),
      fastestPadTurnaroundCapeCanaveral:
        b.fastestPadTurnaroundCapeCanaveral ?? b.fastestTurnaroundCapeCanaveral ?? emptyTurnaround(),
      fastestPadTurnaroundVandenberg:
        b.fastestPadTurnaroundVandenberg ?? b.fastestTurnaroundVandenberg ?? emptyTurnaround(),
      fastestPadTurnaroundStarbase:
        b.fastestPadTurnaroundStarbase ?? b.fastestTurnaroundStarbase ?? emptyTurnaround(),
      // Alias canoniques dérivés. `active`/`total` ne sont pas exposés par la
      // source spacexnow : `total` signifie ici « tentatives d'atterrissage ».
      list,
      active,
      total: b.totalAttempts,
      recordFlights: b.mostFlights.flights,
      recordBooster: b.mostFlights.booster,
    },

    landingSites: payload.landingSites.map((site) => ({
      site: site.site,
      landings: site.landed,
      attempts: site.attempts ?? 0,
      rate: site.rate,
    })),
    landingSitesScope: payload.landingSitesScope ?? {
      excludedFromBoosterTotals: [],
      unattributedAttempts: Math.max(
        0,
        b.totalAttempts - payload.landingSites.reduce(
          (sum, site) => sum + (site.attempts ?? 0), 0,
        ),
      ),
    },

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
