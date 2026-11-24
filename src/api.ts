import { SPACEXNOW_BOOTSTRAP } from '../server/stats-snapshot';
import { normalizeStats } from './statsContract';
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
  // Validation + mapping au même endroit : l'UI ne reçoit jamais le payload brut.
  getStats: async (): Promise<Stats> => normalizeStats(await get<unknown>('/stats')),
};

// ── Mission API ───────────────────────────────────────────────────────────────

export const missionApi = {
  launches: () => get<Launches>('/launches'),
  launch: (id: string) => get<LaunchDetail>(`/launches/${id}`),
  events: () => get<Events>('/events'),
  starlink: () => get<StarlinkSummary>('/starlink'),
  cacheStatus: () => get<CacheStatus>('/cache'),
};

// ── Fallback stats (utilisé quand l'API est injoignable) ──────────────────────
// Plus aucun jeu de valeurs local : la même constante datée que le serveur,
// validée exactement comme la réponse réseau par `normalizeStats`.
export const FALLBACK_STATS: Stats = normalizeStats(SPACEXNOW_BOOTSTRAP);
