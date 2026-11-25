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
/**
 * Date de référence des champs BUSINESS (non publiés par spacexnow.com).
 * Valeurs auditées : abonnés au 30/09/2026 (10-Q), revenu/employés aux dates
 * indiquées dans chaque chaîne (424B4). Chaque valeur porte sa propre date :
 * ce champ est la date du PLUS RÉCENT des champs, pas une date « live ».
 */
export const BUSINESS_FALLBACK_AS_OF = '2026-09-30T00:00:00.000Z'

// ---------------------------------------------------------------------------
// Modèle — un seul contrat, partagé par toutes les couches.
// ---------------------------------------------------------------------------

export type LaunchPerYear = {
  year: number
  /** Noms canoniques : tentatives de l'année, succès de l'année. */
  attempts: number
  successes: number
  rate: number
  /** @deprecated Alias de compatibilité de `attempts` (une version). */
  planned: number
  /** @deprecated Alias de compatibilité de `successes` (une version). */
  completed: number
}

/** Objectif annuel : `target` est la CIBLE, `achieved` le RÉALISÉ. */
export type LaunchGoal = {
  target: number
  achieved: number
  rate: number
  /** @deprecated Alias de compatibilité de `target` (une version). */
  planned: number
  /** @deprecated Alias de compatibilité de `achieved` (une version). */
  completed: number
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
  launchGoal2026: LaunchGoal
  /** Tentatives absentes du tableau annuel (total − Σ tentatives listées). */
  unlistedAttempts: number
  /** Succès absents du tableau annuel (succès − Σ succès listés). */
  unlistedSuccesses: number
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
  /** Présent UNIQUEMENT sur un payload `stale` : date des champs non live. */
  fallbackAsOf?: string
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

type YearBucketInput = {
  year: number
  attempts?: number
  successes?: number
  /** @deprecated alias lu pour les anciens snapshots. */
  planned?: number
  /** @deprecated alias lu pour les anciens snapshots. */
  completed?: number
  rate?: number
}

/** Bucket annuel : `planned`/`completed` ne sont que des alias de compatibilité. */
export function makeYearBucket(input: YearBucketInput): LaunchPerYear {
  const attempts = input.attempts ?? input.planned ?? 0
  const successes = input.successes ?? input.completed ?? 0
  return {
    year: input.year,
    attempts,
    successes,
    rate: rateOf(successes, attempts),
    planned: attempts,
    completed: successes,
  }
}

type LaunchGoalInput = {
  target?: number
  achieved?: number
  /** @deprecated alias lu pour les anciens snapshots. */
  planned?: number
  /** @deprecated alias lu pour les anciens snapshots. */
  completed?: number
  rate?: number
}

/** Objectif : `target` = CIBLE (145), `achieved` = RÉALISÉ (130). */
export function makeLaunchGoal(input: LaunchGoalInput): LaunchGoal {
  const target = input.target ?? input.planned ?? 0
  const achieved = input.achieved ?? input.completed ?? 0
  return {
    target,
    achieved,
    rate: rateOf(achieved, target),
    planned: target,
    completed: achieved,
  }
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
  const launchesPerYear = input.launchCadence.launchesPerYear.map((entry) =>
    makeYearBucket(entry),
  )
  const bestYear = launchesPerYear.reduce<LaunchPerYear>(
    (best, entry) => (entry.successes > best.successes ? entry : best),
    launchesPerYear[0] ?? input.launchCadence.mostLaunchesInYear,
  )
  // Copie explicite : le record ne doit pas partager sa référence avec la
  // collection annuelle (sinon une mutation locale fausse les invariants).
  const mostLaunchesInYear: LaunchPerYear = makeYearBucket(bestYear)
  const totalLaunches = input.launchCadence.totalLaunches
  const successfulLaunches = input.launchCadence.successfulLaunches
  const listedAttempts = launchesPerYear.reduce((sum, entry) => sum + entry.attempts, 0)
  const listedSuccesses = launchesPerYear.reduce((sum, entry) => sum + entry.successes, 0)
  // Deux natures distinctes : 6 tentatives non listées et 3 succès non listés.
  // L'ancien « unlistedLaunches = 15 » mélangeait les deux (6 + 9 échecs).
  const unlistedAttempts = totalLaunches - listedAttempts
  const unlistedSuccesses = successfulLaunches - listedSuccesses

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
    // Un payload live ne porte JAMAIS de fallbackAsOf : ce champ ne qualifie
    // que les champs non live d'un instantané `stale`.
    fallbackAsOf: input.stale ? (input.fallbackAsOf ?? BUSINESS_FALLBACK_AS_OF) : undefined,
    launchCadence: {
      ...input.launchCadence,
      successfulLaunches,
      failedLaunches: Math.max(0, totalLaunches - successfulLaunches),
      successRate: rateOf(successfulLaunches, totalLaunches),
      launchesPerYear,
      mostLaunchesInYear,
      launchGoal2026: makeLaunchGoal(input.launchCadence.launchGoal2026),
      unlistedAttempts,
      unlistedSuccesses,
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
    check(
      entry.attempts >= 0 && entry.successes >= 0 && entry.successes <= entry.attempts,
      `launchesPerYear[${index}] incohérent`,
    )
    validRate(entry.rate, entry.successes, entry.attempts, `launchesPerYear[${index}].rate`)
  })
  validRate(
    cadence.mostLaunchesInYear.rate,
    cadence.mostLaunchesInYear.successes,
    cadence.mostLaunchesInYear.attempts,
    'mostLaunchesInYear.rate',
  )
  const bestYear = cadence.launchesPerYear.reduce<LaunchPerYear | null>(
    (best, entry) => (!best || entry.successes > best.successes ? entry : best),
    null,
  )
  if (bestYear) {
    check(
      cadence.mostLaunchesInYear.successes === bestYear.successes &&
        cadence.mostLaunchesInYear.attempts === bestYear.attempts,
      'mostLaunchesInYear doit être dérivé de launchesPerYear',
    )
  }
  validRate(
    cadence.launchGoal2026.rate,
    cadence.launchGoal2026.achieved,
    cadence.launchGoal2026.target,
    'launchGoal2026.rate',
  )
  const listedAttempts = cadence.launchesPerYear.reduce((sum, entry) => sum + entry.attempts, 0)
  const listedSuccesses = cadence.launchesPerYear.reduce((sum, entry) => sum + entry.successes, 0)
  check(
    listedAttempts + cadence.unlistedAttempts === cadence.totalLaunches,
    `somme(par année) + tentatives non listées (${listedAttempts} + ${cadence.unlistedAttempts}) != total (${cadence.totalLaunches})`,
  )
  check(
    listedSuccesses + cadence.unlistedSuccesses === cadence.successfulLaunches,
    `somme(par année) + succès non listés (${listedSuccesses} + ${cadence.unlistedSuccesses}) != succès (${cadence.successfulLaunches})`,
  )
  check(
    cadence.unlistedAttempts >= 0 && cadence.unlistedSuccesses >= 0,
    'unlistedAttempts / unlistedSuccesses doivent être >= 0',
  )
  check(
    input.stale || input.fallbackAsOf === undefined,
    'fallbackAsOf interdit sur un payload live (stale:false)',
  )

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

/** Record global de pad : « Fastest » de spacexnow, pas le record booster. */
const globalPadRecord: Turnaround = {
  duration: '38 minutes, 31 seconds',
  firstFlight: 'Globalstar 2-R Launch 1 (Aug 16 2026)',
  secondFlight: 'USSF-366 (Aug 16 2026)',
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
      makeYearBucket({ year: 2026, attempts: 111, successes: 111 }),
      makeYearBucket({ year: 2025, attempts: 170, successes: 167 }),
      makeYearBucket({ year: 2024, attempts: 138, successes: 136 }),
      makeYearBucket({ year: 2023, attempts: 98, successes: 96 }),
      makeYearBucket({ year: 2022, attempts: 61, successes: 61 }),
      makeYearBucket({ year: 2021, attempts: 31, successes: 31 }),
      makeYearBucket({ year: 2020, attempts: 25, successes: 25 }),
      makeYearBucket({ year: 2019, attempts: 13, successes: 13 }),
      makeYearBucket({ year: 2018, attempts: 21, successes: 21 }),
      makeYearBucket({ year: 2017, attempts: 18, successes: 18 }),
      makeYearBucket({ year: 2016, attempts: 9, successes: 8 }),
      makeYearBucket({ year: 2015, attempts: 7, successes: 6 }),
      makeYearBucket({ year: 2014, attempts: 6, successes: 6 }),
      makeYearBucket({ year: 2013, attempts: 3, successes: 3 }),
      makeYearBucket({ year: 2012, attempts: 2, successes: 2 }),
      makeYearBucket({ year: 2010, attempts: 2, successes: 2 }),
    ],
    // Dérivé de launchesPerYear (2025 : 167/170 = 98.24), jamais copié de
    // launchGoal2026 (111/145 = 76.55).
    mostLaunchesInYear: makeYearBucket({ year: 2025, attempts: 170, successes: 167 }),
    launchGoal2026: makeLaunchGoal({ target: 145, achieved: 111 }),
    unlistedAttempts: 0,
    unlistedSuccesses: 0,
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
    // Record global de pad = ligne « Fastest » (38 min 31 s), pas le record
    // du site de Cape Canaveral et pas le record booster (9 j 3 h).
    fastestPadTurnaround: globalPadRecord,
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
    revenue2025: '18 674 M$ (FY2025, consolidé audité — SEC 424B4, retraité xAI/X)',
    valuation: 'SPCX cotée depuis le 12/06/2026 (prix IPO 135 $/action — SEC 424B4)',
    employees: '> 22 000 (31/03/2026 — SEC 424B4)',
    starlinkSubscribers: '13,6 M (30/09/2026 — SEC 10-Q, lignes consommateur)',
    starlinkRevenue: '11 387 M$ (FY2025, segment Connectivity — SEC 424B4)',
  },
}

export const SPACEXNOW_BOOTSTRAP: SpaceXNowStats = finalizeStats(rawBootstrap)

// Échec bruyant à l'import si une régression réintroduit une incohérence.
assertStatsInvariants(SPACEXNOW_BOOTSTRAP)
