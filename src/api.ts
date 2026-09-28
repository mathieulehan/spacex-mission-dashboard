import { useQuery } from '@tanstack/react-query';
import type { StatsData } from './types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export const statsApi = {
  getStats: () => get<StatsData>('/stats'),
};

// ── Fallback stats (used when API is unreachable) ────────────────────────────

export const FALLBACK_STATS: StatsData = {
  launchCadence: {
    total: 328,
    successful: 312,
    successRate: 95.12,
    consecutive: 270,
    thisYear: 78,
  },
  boosters: {
    active: 18,
    total: 20,
    landingRate: 96.65,
    recordFlights: 27,
    recordBooster: 'B1067',
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
};
