/**
 * Source de vérité UNIQUE et datée pour /api/stats.
 *
 * Ce module est volontairement pur (aucune dépendance Node, aucun Fetch) :
 * il est importé aussi bien par le serveur que par le client. Tous les taux
 * et agrégats dérivés sont recalculés ici par `finalizeStats()`, puis validés
 * par `assertStatsInvariants()`. Aucun chiffre n'est recopié d'un autre bloc.
 */

export const SPACEXNOW_STATS_URL = 'https://spacexnow.com/stats'
export const SPACEXNOW_BOOTSTRAP_FETCHED_AT = '2026-09-20T12:00:00.000Z'
/** Date des chiffres business, non publiés par spacexnow.com. */
export const BUSINESS_FALLBACK_AS_OF = '2025-01-01T00:00:00.000Z'

// ---------------------------------------------------------------------------
// Modèle — un seul contrat, partagé par toutes les couches.
// ---------------------------------------------------------------------------

export type LaunchPerYear = {
  year: number
  planned: number
  completed: number
  rate: number
}

export type Turnaround = {
  duration: string
  booster?: string
  firstFlight: string
  secondFlight: string
}

/** Ancien nom conservé comme alias de `Turnaround` pour les imports existants. */
export type BoosterFastestTurnaround = Turnaround

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
  /** Réutilisation d'un booster (B1088) — PAS un turnaround de pad. */
  fastestBoosterTurnaround: Turnaround
  /** Record global de turnaround de pad (« Fastest » chez spacexnow). */
  fastestPadTurnaround: Turnaround
  /** Records de pad par site — même nature que `fastestPadTurnaround`. */
  fastestPadTurnaroundCapeCanaveral: Turnaround
  fastestPadTurnaroundVandenberg: Turnaround
  fastestPadTurnaroundStarbase: Turnaround
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
  site: string
  landed: number
  attempts: number
  rate: number
}

export type LandingSitesStats = Array<LandingSiteStats>

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
  mostLaunchesInYear: LaunchPerYear
  launchGoal2026: { planned: number; completed: number; rate: number }
  /** Lancements absents du tableau « Launches Per Year » (années non listées). */
  unlistedLaunches: number
}

export type LandingSitesScope = {
  /** Sites dont les atterrissages ne sont pas des booster landings Falcon 9. */
  excludedFromBoosterTotals: string[]
  /** Tentatives de booster non attribuables à un site listé. */
  unattributedAttempts: number
}

export type SpaceXNowStats = {
  fetchedAt: string
  stale: boolean
  source: 'spacexnow' | 'fallback'
  sourceUrl: string
  /** Date des champs non publiés par la source (business), jamais du live. */
  fallbackAsOf: string
  launchCadence: LaunchCadenceStats
  boosters: BoosterStats
  starlink: StarlinkStats
  landingSites: LandingSitesStats
  landingSitesScope: LandingSitesScope
  dragons: DragonStats
  capsules: CapsuleStats
  business: BusinessStats
}

// ---------------------------------------------------------------------------
// Mathématiques partagées
// ---------------------------------------------------------------------------

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Taux en pourcentage, TOUJOURS calculé depuis les compteurs, arrondi à 2 décimales. */
export function rateOf(success: number, total: number): number {
  return total > 0 ? round2((success / total) * 100) : 0
}

/** Durée textuelle → minutes, pour comparer des records de même nature. */
export function turnaroundMinutes(duration: string): number {
  const text = duration.toLowerCase()
  const part = (unit: string): number =>
    Number(text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}`))?.[1] ?? 0)
  return (
    part('month') * 30 * 24 * 60 +
    part('day') * 24 * 60 +
    part('hour') * 60 +
    part('minute') +
    part('second') / 60
  )
}

// ---------------------------------------------------------------------------
// Dérivation unique de tous les agrégats
// ---------------------------------------------------------------------------

function emptyTurnaround(): Turnaround {
  return { duration: '', firstFlight: '', secondFlight: '' }
}

/**
 * Recalcule chaque champ dérivé depuis les collections de compteurs.
 * Appelé sur TOUTES les valeurs servies (live, cache, secours, LL2) : c'est
 * le seul endroit où un taux ou un agrégat peut être produit.
 */
export function finalizeStats(input: SpaceXNowStats): SpaceXNowStats {
  const launchesPerYear = input.launchCadence.launchesPerYear.map((entry) => ({
    year: entry.year,
    planned: entry.planned,
    completed: entry.completed,
    rate: rateOf(entry.completed, entry.planned),
  }))
  const bestYear = launchesPerYear.reduce<LaunchPerYear>(
    (best, entry) => (entry.completed > best.completed ? entry : best),
    launchesPerYear[0] ?? input.launchCadence.mostLaunchesInYear,
  )
  // Copie explicite : le record ne doit pas partager sa référence avec la
  // collection annuelle (sinon une mutation locale fausse les invariants).
  const mostLaunchesInYear: LaunchPerYear = { ...bestYear }
  const totalLaunches = input.launchCadence.totalLaunches
  const unlistedLaunches = totalLaunches - launchesPerYear.reduce((sum, entry) => sum + entry.completed, 0)

  const boosters: BoosterStats = {
    ...input.boosters,
    landingRate: rateOf(input.boosters.totalLanded, input.boosters.totalAttempts),
    block5Rate: rateOf(input.boosters.block5Landed, input.boosters.block5Attempts),
    fastestBoosterTurnaround: input.boosters.fastestBoosterTurnaround ?? emptyTurnaround(),
    fastestPadTurnaround: input.boosters.fastestPadTurnaround ?? emptyTurnaround(),
  }

  const landingSites = input.landingSites.map((site) => ({
    ...site,
    rate: rateOf(site.landed, site.attempts),
  }))
  const excludedFromBoosterTotals = input.landingSitesScope?.excludedFromBoosterTotals ?? ['Catch']
  const includedAttempts = landingSites
    .filter((site) => !excludedFromBoosterTotals.includes(site.site))
    .reduce((sum, site) => sum + site.attempts, 0)
  const landingSitesScope: LandingSitesScope = {
    excludedFromBoosterTotals,
    unattributedAttempts: boosters.totalAttempts - includedAttempts,
  }

  return {
    ...input,
    sourceUrl: input.sourceUrl || SPACEXNOW_STATS_URL,
    launchCadence: {
      ...input.launchCadence,
      successfulLaunches: input.launchCadence.successfulLaunches,
      failedLaunches: Math.max(0, totalLaunches - input.launchCadence.successfulLaunches),
      successRate: rateOf(input.launchCadence.successfulLaunches, totalLaunches),
      launchesPerYear,
      mostLaunchesInYear,
      launchGoal2026: {
        ...input.launchCadence.launchGoal2026,
        rate: rateOf(input.launchCadence.launchGoal2026.completed, input.launchCadence.launchGoal2026.planned),
      },
      unlistedLaunches,
    },
    boosters,
    starlink: {
      ...input.starlink,
      totalLaunches,
      starlinkRate: rateOf(input.starlink.starlinkLaunches, totalLaunches),
    },
    landingSites,
    landingSitesScope,
    capsules: {
      ...input.capsules,
      rate: rateOf(input.capsules.landed, input.capsules.attempts),
    },
  }
}

// ---------------------------------------------------------------------------
// Invariants runtime — une violation est une erreur, jamais un NaN silencieux.
// ---------------------------------------------------------------------------

export function assertStatsInvariants(input: SpaceXNowStats): void {
  const violations: string[] = []
  const check = (ok: boolean, message: string): void => {
    if (!ok) violations.push(message)
  }
  const finite = (value: number): boolean => Number.isFinite(value)
  const validRate = (rate: number, success: number, total: number, label: string): void => {
    check(finite(rate) && rate >= 0 && rate <= 100, `${label} doit être dans [0, 100]`)
    check(rate === rateOf(success, total), `${label} doit être calculé depuis ses compteurs`)
  }

  const cadence = input.launchCadence
  check(finite(cadence.totalLaunches) && cadence.totalLaunches >= 0, 'totalLaunches invalide')
  check(
    cadence.currentSuccessive <= cadence.mostSuccessive,
    `currentSuccessive (${cadence.currentSuccessive}) > mostSuccessive (${cadence.mostSuccessive})`,
  )
  check(
    cadence.successfulLaunches >= 0 && cadence.successfulLaunches <= cadence.totalLaunches,
    'successfulLaunches hors de [0, totalLaunches]',
  )
  validRate(cadence.successRate, cadence.successfulLaunches, cadence.totalLaunches, 'successRate')
  cadence.launchesPerYear.forEach((entry, index) => {
    check(entry.planned >= 0 && entry.completed >= 0 && entry.completed <= entry.planned, `launchesPerYear[${index}] incohérent`)
    validRate(entry.rate, entry.completed, entry.planned, `launchesPerYear[${index}].rate`)
  })
  validRate(
    cadence.mostLaunchesInYear.rate,
    cadence.mostLaunchesInYear.completed,
    cadence.mostLaunchesInYear.planned,
    'mostLaunchesInYear.rate',
  )
  const bestYear = cadence.launchesPerYear.reduce<LaunchPerYear | null>(
    (best, entry) => (!best || entry.completed > best.completed ? entry : best),
    null,
  )
  if (bestYear) {
    check(
      cadence.mostLaunchesInYear.completed === bestYear.completed &&
        cadence.mostLaunchesInYear.planned === bestYear.planned,
      'mostLaunchesInYear doit être dérivé de launchesPerYear',
    )
  }
  validRate(
    cadence.launchGoal2026.rate,
    cadence.launchGoal2026.completed,
    cadence.launchGoal2026.planned,
    'launchGoal2026.rate',
  )
  const listed = cadence.launchesPerYear.reduce((sum, entry) => sum + entry.completed, 0)
  check(
    listed + cadence.unlistedLaunches === cadence.totalLaunches,
    `somme(par année) + exclusions (${listed} + ${cadence.unlistedLaunches}) != total (${cadence.totalLaunches})`,
  )
  check(cadence.unlistedLaunches >= 0, 'unlistedLaunches doit être >= 0')

  const boosters = input.boosters
  check(boosters.totalLanded >= 0 && boosters.totalLanded <= boosters.totalAttempts, 'boosters.totalLanded hors de [0, totalAttempts]')
  validRate(boosters.landingRate, boosters.totalLanded, boosters.totalAttempts, 'boosters.landingRate')
  check(boosters.block5Landed >= 0 && boosters.block5Landed <= boosters.block5Attempts, 'block5Landed hors de [0, block5Attempts]')
  validRate(boosters.block5Rate, boosters.block5Landed, boosters.block5Attempts, 'boosters.block5Rate')

  const globalPad = turnaroundMinutes(boosters.fastestPadTurnaround?.duration ?? '')
  check(globalPad > 0, 'fastestPadTurnaround manquant')
  const sitePads = [
    boosters.fastestPadTurnaroundCapeCanaveral,
    boosters.fastestPadTurnaroundVandenberg,
    boosters.fastestPadTurnaroundStarbase,
  ]
    .map((site) => turnaroundMinutes(site?.duration ?? ''))
    .filter((minutes) => minutes > 0)
  if (sitePads.length > 0) {
    check(
      globalPad <= Math.min(...sitePads),
      `record global de pad (${globalPad} min) plus lent qu'un record de site`,
    )
  }
  check(
    (boosters.fastestBoosterTurnaround?.duration ?? '').length > 0,
    'fastestBoosterTurnaround manquant (méthode booster, pas pad)',
  )

  input.landingSites.forEach((site, index) => {
    check(site.attempts >= 0 && site.landed >= 0 && site.landed <= site.attempts, `landingSites[${index}] incohérent`)
    validRate(site.rate, site.landed, site.attempts, `landingSites[${index}].rate`)
  })
  const excluded = input.landingSitesScope?.excludedFromBoosterTotals ?? []
  const included = input.landingSites.filter((site) => !excluded.includes(site.site))
  const siteLanded = included.reduce((sum, site) => sum + site.landed, 0)
  const siteAttempts = included.reduce((sum, site) => sum + site.attempts, 0)
  check(
    siteLanded === boosters.totalLanded,
    `somme(landingSites.landed) (${siteLanded}) != boosters.totalLanded (${boosters.totalLanded})`,
  )
  check(
    siteAttempts + input.landingSitesScope.unattributedAttempts === boosters.totalAttempts,
    `somme(landingSites.attempts) + non attribués (${siteAttempts} + ${input.landingSitesScope.unattributedAttempts}) != boosters.totalAttempts (${boosters.totalAttempts})`,
  )
  check(input.landingSitesScope.unattributedAttempts >= 0, 'unattributedAttempts doit être >= 0')

  check(input.capsules.landed >= 0 && input.capsules.landed <= input.capsules.attempts, 'capsules incohérentes')
  validRate(input.capsules.rate, input.capsules.landed, input.capsules.attempts, 'capsules.rate')
  check(!Number.isNaN(Date.parse(input.fetchedAt)), 'fetchedAt invalide')

  if (violations.length > 0) {
    throw new Error(`Invariants /api/stats violés : ${violations.join(' | ')}`)
  }
}

// ---------------------------------------------------------------------------
// Snapshot de secours — UNE seule constante datée, réutilisée par tous les
// chemins (service serveur, validateur, fallback client, documentation).
// ---------------------------------------------------------------------------

const capeCanaveralPad: Turnaround = {
  duration: '1 day, 21 hours',
  firstFlight: 'Starlink Group 6-97 (Jan 12 2026)',
  secondFlight: 'Starlink Group 6-98 (Jan 14 2026)',
}

const rawBootstrap: SpaceXNowStats = {
  fetchedAt: SPACEXNOW_BOOTSTRAP_FETCHED_AT,
  stale: true,
  source: 'fallback',
  sourceUrl: SPACEXNOW_STATS_URL,
  fallbackAsOf: BUSINESS_FALLBACK_AS_OF,
  launchCadence: {
    totalLaunches: 721,
    successfulLaunches: 709,
    failedLaunches: 12,
    successRate: 0,
    // Le record historique et la série en cours ne peuvent pas diverger.
    mostSuccessive: 335,
    currentSuccessive: 335,
    launchesPerYear: [
      { year: 2026, planned: 111, completed: 111, rate: 0 },
      { year: 2025, planned: 170, completed: 167, rate: 0 },
      { year: 2024, planned: 138, completed: 136, rate: 0 },
      { year: 2023, planned: 98, completed: 96, rate: 0 },
      { year: 2022, planned: 61, completed: 61, rate: 0 },
      { year: 2021, planned: 31, completed: 31, rate: 0 },
      { year: 2020, planned: 25, completed: 25, rate: 0 },
      { year: 2019, planned: 13, completed: 13, rate: 0 },
      { year: 2018, planned: 21, completed: 21, rate: 0 },
      { year: 2017, planned: 18, completed: 18, rate: 0 },
      { year: 2016, planned: 9, completed: 8, rate: 0 },
      { year: 2015, planned: 7, completed: 6, rate: 0 },
      { year: 2014, planned: 6, completed: 6, rate: 0 },
      { year: 2013, planned: 3, completed: 3, rate: 0 },
      { year: 2012, planned: 2, completed: 2, rate: 0 },
      { year: 2010, planned: 2, completed: 2, rate: 0 },
    ],
    // Dérivé de launchesPerYear (2025 : 167/170 = 98.24), jamais copié de
    // launchGoal2026 (111/145 = 76.55).
    mostLaunchesInYear: { year: 2025, planned: 170, completed: 167, rate: 0 },
    launchGoal2026: { planned: 145, completed: 111, rate: 0 },
    unlistedLaunches: 0,
  },
  boosters: {
    totalLanded: 663,
    totalAttempts: 686,
    landingRate: 0,
    mostFlights: { booster: 'B1067', flights: 37 },
    reflown: 625,
    block5Landed: 639,
    block5Attempts: 645,
    block5Rate: 0,
    block5Reflown: 611,
    fastestBoosterTurnaround: {
      duration: '9 days, 3 hours',
      booster: 'B1088',
      firstFlight: 'SPHEREx & PUNCH (Mar 12 2025)',
      secondFlight: 'NROL-57 (Mar 21 2025)',
    },
    // Record global de pad = minimum des records de pad connus du snapshot.
    fastestPadTurnaround: capeCanaveralPad,
    fastestPadTurnaroundCapeCanaveral: capeCanaveralPad,
    fastestPadTurnaroundVandenberg: {
      duration: '2 days, 7 hours',
      firstFlight: 'NROL-179 (Jun 19 2026)',
      secondFlight: 'Starlink Group 17-28 (Jun 21 2026)',
    },
    fastestPadTurnaroundStarbase: {
      duration: '1 month, 7 days',
      firstFlight: 'Starship Flight 5 (Oct 13 2024)',
      secondFlight: 'Starship Flight 6 (Nov 19 2024)',
    },
  },
  starlink: {
    inOrbit: 11160,
    starlinkLaunches: 426,
    totalLaunches: 721,
    starlinkRate: 0,
    heaviestLeoLift: { mass: '17,500 kg', mission: 'Starlink 6-39 (+54 satellites)' },
    heaviestGtoLift: { mass: '9,200 kg', mission: 'Jupiter 3 / EchoStar-24' },
  },
  landingSites: [
    { site: 'LZ1', landed: 53, attempts: 54, rate: 0 },
    { site: 'LZ2', landed: 19, attempts: 19, rate: 0 },
    { site: 'LZ4', landed: 35, attempts: 35, rate: 0 },
    { site: 'LZ40', landed: 6, attempts: 6, rate: 0 },
    { site: 'ASOG', landed: 167, attempts: 168, rate: 0 },
    { site: 'JRTI', landed: 156, attempts: 159, rate: 0 },
    { site: 'OCISLY', landed: 227, attempts: 235, rate: 0 },
    // Catch = Mechazilla (Starship), exclu des totaux de booster Falcon 9.
    { site: 'Catch', landed: 3, attempts: 4, rate: 0 },
  ],
  landingSitesScope: { excludedFromBoosterTotals: ['Catch'], unattributedAttempts: 0 },
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
  capsules: { landed: 56, attempts: 57, rate: 0, reflown: 33 },
  business: {
    revenue2025: '12.5B USD (estimated)',
    valuation: '350B USD (private, 2024)',
    employees: '~10,000 (estimated)',
    starlinkSubscribers: '~4M (estimated, Q1 2025)',
    starlinkRevenue: '7.4B USD (2024, est.)',
  },
}

export const SPACEXNOW_BOOTSTRAP: SpaceXNowStats = finalizeStats(rawBootstrap)

// Échec bruyant à l'import si une régression réintroduit une incohérence.
assertStatsInvariants(SPACEXNOW_BOOTSTRAP)
