import { useQuery } from '@tanstack/react-query';
import type {
  Stats,
  Launches,
  LaunchDetail,
  Events,
  StarlinkSummary,
  CacheStatus,
} from './types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export const statsApi = {
  getStats: () => get<Stats>('/stats'),
};

// ── Mission API ───────────────────────────────────────────────────────────────

export const missionApi = {
  launches: () => get<Launches>('/launches'),
  launch: (id: string) => get<LaunchDetail>(`/launches/${id}`),
  events: () => get<Events>('/events'),
  starlink: () => get<StarlinkSummary>('/starlink'),
  cacheStatus: () => get<CacheStatus>('/cache'),
};

// ── Fallback stats (used when API is unreachable) ────────────────────────────

export const FALLBACK_STATS: Stats = {
  fetchedAt: new Date().toISOString(),
  stale: true,
  source: 'fallback',
  launchCadence: {
    totalLaunches: 328,
    successfulLaunches: 312,
    failedLaunches: 16,
    successRate: 95.12,
    mostSuccessive: 270,
    currentSuccessive: 270,
    launchesPerYear: [
      { year: 2010, planned: 3, completed: 3, rate: 100 },
      { year: 2011, planned: 0, completed: 0, rate: 0 },
      { year: 2012, planned: 2, completed: 2, rate: 100 },
      { year: 2013, planned: 3, completed: 3, rate: 100 },
      { year: 2014, planned: 3, completed: 3, rate: 100 },
      { year: 2015, planned: 6, completed: 6, rate: 100 },
      { year: 2016, planned: 21, completed: 20, rate: 95.2 },
      { year: 2017, planned: 18, completed: 18, rate: 100 },
      { year: 2018, planned: 21, completed: 21, rate: 100 },
      { year: 2019, planned: 13, completed: 13, rate: 100 },
      { year: 2020, planned: 26, completed: 26, rate: 100 },
      { year: 2021, planned: 31, completed: 31, rate: 100 },
      { year: 2022, planned: 61, completed: 61, rate: 100 },
      { year: 2023, planned: 98, completed: 96, rate: 98 },
      { year: 2024, planned: 142, completed: 140, rate: 98.6 },
      { year: 2025, planned: 133, completed: 130, rate: 97.7 },
      { year: 2026, planned: 78, completed: 78, rate: 100 },
    ],
    mostLaunchesInYear: { year: 2024, planned: 142, completed: 140, rate: 98.6 },
    launchGoal2026: { planned: 78, completed: 78, rate: 100 },
    total: 328,
    successful: 312,
    consecutive: 270,
    thisYear: 78,
  },
  boosters: {
    totalLanded: 298,
    totalAttempts: 312,
    active: 18,
    total: 20,
    recordFlights: 27,
    recordBooster: 'B1067',
    landingRate: 96.65,
    mostFlights: { booster: 'B1067', flights: 27 },
    reflown: 245,
    block5Landed: 210,
    block5Attempts: 216,
    block5Rate: 97.22,
    block5Reflown: 198,
    fastestTurnaround: {
      duration: '21 days 4 hours',
      booster: 'B1067',
      firstFlight: '2023-06-12T00:00:00Z',
      secondFlight: '2023-07-03T00:00:00Z',
    },
    fastestTurnaroundCapeCanaveral: {
      duration: '16 days',
      booster: 'B1080',
      firstFlight: '2024-01-01T00:00:00Z',
      secondFlight: '2024-01-17T00:00:00Z',
    },
    fastestTurnaroundVandenberg: {
      duration: '18 days',
      booster: 'B1073',
      firstFlight: '2023-10-01T00:00:00Z',
      secondFlight: '2023-10-19T00:00:00Z',
    },
    fastestTurnaroundStarbase: {
      duration: '27 days',
      booster: 'B1062',
      firstFlight: '2024-03-14T00:00:00Z',
      secondFlight: '2024-04-10T00:00:00Z',
    },
    active: 18,
    total: 20,
    recordFlights: 27,
    recordBooster: 'B1067',
    list: [
      { serialNumber: 'B1067', type: 'Falcon 9 Block 5', flights: 27, landed: 27, attempted: 27, landingRate: 100, status: 'active', lastFlight: '2026-08-15' },
      { serialNumber: 'B1080', type: 'Falcon 9 Block 5', flights: 22, landed: 22, attempted: 22, landingRate: 100, status: 'active', lastFlight: '2026-08-20' },
      { serialNumber: 'B1073', type: 'Falcon 9 Block 5', flights: 19, landed: 18, attempted: 19, landingRate: 94.7, status: 'active', lastFlight: '2026-07-30' },
      { serialNumber: 'B1062', type: 'Falcon 9 Block 5', flights: 18, landed: 18, attempted: 18, landingRate: 100, status: 'active', lastFlight: '2026-08-05' },
      { serialNumber: 'B1077', type: 'Falcon 9 Block 5', flights: 16, landed: 16, attempted: 16, landingRate: 100, status: 'active', lastFlight: '2026-06-12' },
      { serialNumber: 'B1088', type: 'Falcon 9 Block 5', flights: 14, landed: 14, attempted: 14, landingRate: 100, status: 'active', lastFlight: '2026-08-22' },
      { serialNumber: 'B1071', type: 'Falcon 9 Block 5', flights: 12, landed: 11, attempted: 12, landingRate: 91.7, status: 'active', lastFlight: '2026-05-18' },
      { serialNumber: 'B1069', type: 'Falcon 9 Block 5', flights: 11, landed: 11, attempted: 11, landingRate: 100, status: 'retired', lastFlight: '2025-11-20' },
      { serialNumber: 'B1072', type: 'Falcon 9 Block 5', flights: 10, landed: 10, attempted: 10, landingRate: 100, status: 'retired', lastFlight: '2025-09-14' },
      { serialNumber: 'B1061', type: 'Falcon 9 Block 5', flights: 8, landed: 7, attempted: 8, landingRate: 87.5, status: 'retired', lastFlight: '2024-12-05' },
      { serialNumber: 'B1058', type: 'Falcon 9 Block 5', flights: 7, landed: 7, attempted: 7, landingRate: 100, status: 'retired', lastFlight: '2024-08-28' },
      { serialNumber: 'B1060', type: 'Falcon 9 Block 5', flights: 6, landed: 5, attempted: 6, landingRate: 83.3, status: 'lost', lastFlight: '2024-03-20' },
      { serialNumber: 'B1055', type: 'Falcon 9 Block 5', flights: 5, landed: 5, attempted: 5, landingRate: 100, status: 'retired', lastFlight: '2024-01-15' },
      { serialNumber: 'B1053', type: 'Falcon 9 Block 5', flights: 4, landed: 4, attempted: 4, landingRate: 100, status: 'retired', lastFlight: '2023-10-01' },
      { serialNumber: 'B1051', type: 'Falcon 9 Block 5', flights: 3, landed: 3, attempted: 3, landingRate: 100, status: 'retired', lastFlight: '2023-06-12' },
      { serialNumber: 'B1049', type: 'Falcon 9 Block 5', flights: 3, landed: 2, attempted: 3, landingRate: 66.7, status: 'lost', lastFlight: '2023-02-15' },
      { serialNumber: 'B1048', type: 'Falcon 9 Block 5', flights: 2, landed: 2, attempted: 2, landingRate: 100, status: 'retired', lastFlight: '2022-12-20' },
      { serialNumber: 'B1047', type: 'Falcon 9 Block 5', flights: 1, landed: 1, attempted: 1, landingRate: 100, status: 'retired', lastFlight: '2022-08-05' },
    ],
  },
  launchesPerYear: [
    { year: 2010, launches: 3 },
    { year: 2011, launches: 0 },
    { year: 2012, launches: 2 },
    { year: 2013, launches: 3 },
    { year: 2014, launches: 3 },
    { year: 2015, launches: 6 },
    { year: 2016, launches: 21 },
    { year: 2017, launches: 18 },
    { year: 2018, launches: 21 },
    { year: 2019, launches: 13 },
    { year: 2020, launches: 26 },
    { year: 2021, launches: 31 },
    { year: 2022, launches: 61 },
    { year: 2023, launches: 98 },
    { year: 2024, launches: 142 },
    { year: 2025, launches: 133 },
    { year: 2026, launches: 78 },
  ],
  landingSites: [
    { site: 'LZ-1 (KSC)', landings: 68, rate: 95 },
    { site: 'LZ-2 (KSC)', landings: 52, rate: 92 },
    { site: 'ASES (OCISLY)', landings: 142, rate: 97 },
    { site: 'ASES (JRTI)', landings: 62, rate: 94 },
    { site: 'SLC-4E (VES)', landings: 48, rate: 96 },
  ],
  starlink: {
    inOrbit: 8200,
    starlinkLaunches: 120,
    totalLaunches: 328,
    starlinkRate: 36.6,
    heaviestLeoLift: { mass: '22,800 kg', mission: 'Starlink Group 6-42' },
    heaviestGtoLift: { mass: '6,500 kg', mission: 'GPS III SV05' },
  },
  dragons: {
    cargoMissions: 30,
    crewMissions: 13,
    testMissions: 2,
    totalMissions: 45,
    issCargoUp: '2,000 kg',
    issCargoDown: '1,200 kg',
    reflights: 25,
    crewInOrbit: 9,
    crewFlownTotal: 52,
  },
  capsules: {
    landed: 45,
    attempts: 47,
    rate: 95.7,
    reflown: 25,
  },
  business: {
    revenue2025: '$11.8B',
    valuation: '$350B',
    employees: '13,000',
    starlinkSubscribers: '4.5M',
    starlinkRevenue: '$6.8B',
  },
};
