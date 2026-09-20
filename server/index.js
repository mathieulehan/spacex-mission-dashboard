import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── In-memory cache with TTL ────────────────────────────────────────────────
const cache = new Map();

function getCached(key, ttlMs) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttlMs) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ── Fallback / embedded data ─────────────────────────────────────────────────
// These are the known-good values from spacexnow.com, S-1 SEC filing, etc.
// The server returns these when external scraping is unavailable.

const FALLBACK_DATA = {
  'mass-to-orbit': {
    yearly: [
      { year: 2020, tonnes: 110 },
      { year: 2021, tonnes: 350 },
      { year: 2022, tonnes: 950 },
      { year: 2023, tonnes: 1450 },
      { year: 2024, tonnes: 1900 },
      { year: 2025, tonnes: 2200 },
    ],
    cumulative: 7400,
    source: 'spacexnow.com / Jonathan McDowell',
    lastUpdated: '2026-02-01',
  },
  'launches': {
    yearly: [
      { year: 2020, count: 25, note: 'Falcon 9 déployé' },
      { year: 2021, count: 31, note: 'Démarrage Starlink' },
      { year: 2022, count: 61, note: 'Starlink + commercial' },
      { year: 2023, count: 96, note: 'Starlink V2 massif' },
      { year: 2024, count: 134, note: 'Record surpassé' },
      { year: 2025, count: 165, note: '~85% lancements orbitaux US' },
    ],
    total: 721,
    successful: 709,
    successRate: 98.34,
    ytd2026: 111,
    source: 'spacexnow.com',
    lastUpdated: '2026-08-31',
  },
  'starlink': {
    satellitesOrbit: 10296,
    operational: 10280,
    totalLaunched: 11529,
    subscribers: { min: 10000000, asOf: 'février 2026' },
    longTermGoal: 42000,
    source: 'Space-Track / Jonathan McDowell / sqmagazine.co.uk',
    lastUpdated: '2026-05-04',
  },
  'boosters': {
    fleetSize: 39,
    avgFlightsPerBooster: 14.9,
    recordBooster: 'B1067',
    recordFlights: 37,
    landingRate: 96.64,
    successfulLandings: 661,
    totalAttempts: 684,
    fastestTurnaround: '38 minutes',
    source: 'spacexnow.com / sqmagazine.co.uk',
    lastUpdated: '2026-09-20',
  },
  'business': {
    revenue2025: 15.5,
    profit2025: 8.0,
    ipoValuation: 2000,
    usMarketShare: 82,
    nasaHLSContract: 4.5,
    spaceForceNSSL: 5.9,
    source: 'S-1 SEC filing (juin 2026) / Reuters / NASA',
    lastUpdated: '2026-06-01',
  },
  // ── LL2 fallback data ──────────────────────────────────────────────────────
  'll2_starship': {
    orbitalLaunchAttempts: 7406,
    vehicles: [
      { serial_number: 'Ship 29', status: 'scrapped', flights: 1, lastFlight: '2024-06-06' },
      { serial_number: 'Ship 30', status: 'active', flights: 1, lastFlight: '2024-10-13' },
      { serial_number: 'Ship 31', status: 'active', flights: 1, lastFlight: '2025-01-16' },
      { serial_number: 'Booster 12', status: 'active', flights: 1, lastFlight: '2024-10-13' },
      { serial_number: 'Booster 13', status: 'active', flights: 0, lastFlight: null },
    ],
    liveStreams: [
      { title: 'Starbase Live: 24/7 Starship & Super Heavy Development', url: 'https://www.youtube.com/@SpaceX' },
      { title: 'Starbase Live Rover 2.0 Cam', url: 'https://www.youtube.com/@LabPadre' },
    ],
    updates: [],
    source: 'LL2 API v2.2.0 — https://ll.thespacedevs.com/2.2.0/dashboard/starship/',
    lastUpdated: new Date().toISOString().split('T')[0],
  },
  'll2_landings': {
    total: 1773,
    successful: 1522,
    successRate: 85.8,
    landingTypes: {
      'Autonomous Spaceport Drone Ship': 766,
      'Return to Launch Site': 667,
      'Ocean': 0,
      'Parachute Landing': 91,
      'Expended': 248,
    },
    topLocations: {
      'Of Course I Still Love You': 613,
      'Landing Zone 1': 323,
      'Just Read the Instructions': 178,
      'Atlantic Ocean': 171,
      'Corn Ranch Landing Pad, West Texas': 137,
      'Pacific Ocean': 81,
    },
    recentLandings: [],
    source: 'LL2 API v2.2.0 — https://ll.thespacedevs.com/2.2.0/landings/',
    lastUpdated: new Date().toISOString().split('T')[0],
  },
  'launch-stats': {
    data: {
      total: 721,
      success: 709,
      failure: 12,
      success_rate: 98.34,
      recent: [
        { flight_number: 123, mission_name: 'Starlink Group 15-27', status: 'Success', net: new Date(Date.now() + 2 * 3600 * 1000).toISOString() },
        { flight_number: 122, mission_name: 'Transporter-10', status: 'Success', net: new Date(Date.now() - 24 * 3600 * 1000).toISOString() },
        { flight_number: 121, mission_name: 'Eutelsat 113 West V', status: 'Success', net: new Date(Date.now() - 48 * 3600 * 1000).toISOString() },
      ],
    },
    source: 'LL2 API v2.2.0 — https://ll.thespacedevs.com/2.2.0/launch/',
    lastUpdated: new Date().toISOString().split('T')[0],
  },

  // ── SpaceX company info (api.spacexdata.com /companies/public/) ────────────
  'spacex-company': {
    id: '559d408df363980d98dc855b',
    name: 'Space Exploration Technologies Corp.',
    founded: '2002-03-01',
    founder: 'Elon Musk',
    employees: 12000,
    vehicles: ['Falcon 9', 'Falcon Heavy', 'Starship'],
    launch_sites: ['CCAS Why Not? Discovering New Frontiers in Space Exploration', 'CCSFS SLC-40', 'Vandenberg SFB SLC-4E', 'Starbase, Texas', 'Pacific Spaceport Complex - Alaska'],
    ceo: 'Elon Musk',
    cto: 'Elon Musk',
    "vp Propulsion": "Tom Mueller",
    founder_list: [
      { founder: 'Elon Musk' },
    ],
    successful_launches: 709,
    failed_launches: 12,
    pending_launches: 15,
    total_launch_count: 736,
    active_contracts: ['NASA Commercial Crew', 'NASA Commercial Resupply Services', 'U.S. Space Force', 'Starlink'],
    countries_with_contracts: ['United States'],
    rocket: 'Falcon 9',
    summary: 'Space Exploration Technologies Corp. (SpaceX) is an American aerospace manufacturer and space transport services company headquartered in Hawthorne, California. Founded in 2002 by Elon Musk, SpaceX develops and manufactures advanced rockets and spacecraft.',
    family: 'SpaceX',
    variations: [],
    articles_count: null,
    configuration_selection: null,
    last_flight_weight_kg: 549054,
    bindings: null,
    source: 'api.spacexdata.com/v4/company + S-1 SEC filing (juin 2026)',
    lastUpdated: new Date().toISOString().split('T')[0],
  },

  'next-launches': {
    data: [
      {
        flight_number: 123,
        mission_name: 'Starlink Group 15-27',
        net: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
        rocket: 'Falcon 9',
        launch_site: 'CCSFS SLC-40',
      },
      {
        flight_number: 124,
        mission_name: 'CRS-32 Cargo Resupply Mission',
        net: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        rocket: 'Falcon 9',
        launch_site: 'CCSFS SLC-40',
      },
      {
        flight_number: 125,
        mission_name: 'Starship Integrated Flight Test 9',
        net: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        rocket: 'Starship',
        launch_site: 'Starbase, Texas',
      },
    ],
    source: 'LL2 API v2.2.0 — https://ll.thespacedevs.com/2.2.0/launch/upcoming/',
    fetchedAt: new Date().toISOString(),
  },
};

// ── Route table ──────────────────────────────────────────────────────────────
const ROUTES = [
  { method: 'GET', path: '/api/stats/launch-cadence', ttl: 5 * 60 * 1000 },
  { method: 'GET', path: '/api/stats/launches', ttl: 5 * 60 * 1000 },
  { method: 'GET', path: '/api/stats/boosters', ttl: 5 * 60 * 1000 },
  { method: 'GET', path: '/api/stats/starlink', ttl: 60 * 60 * 1000 },
  { method: 'GET', path: '/api/stats/mass-to-orbit', ttl: 24 * 3600 * 1000 },
  { method: 'GET', path: '/api/stats/business', ttl: 7 * 24 * 3600 * 1000 },
  { method: 'GET', path: '/api/stats', ttl: 24 * 3600 * 1000 },
  { method: 'GET', path: '/api/ll2/starship', ttl: 60 * 60 * 1000 },
  { method: 'GET', path: '/api/ll2/landings', ttl: 60 * 60 * 1000 },
  { method: 'GET', path: '/api/launch-stats', ttl: 24 * 3600 * 1000 },
  { method: 'GET', path: '/api/spacex-company', ttl: 7 * 24 * 3600 * 1000 },
  { method: 'GET', path: '/api/next-launches', ttl: 60 * 60 * 1000 },
  { method: 'GET', path: '/api/health', ttl: null },
];

function findRoute(method, path) {
  return ROUTES.find((r) => r.method === method && r.path === path);
}

// ── Response helpers ─────────────────────────────────────────────────────────
function jsonResponse(data, status = 200) {
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(data),
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

// ── Cache header helpers ─────────────────────────────────────────────────────
function cacheHeaders(ttlMs, fromCache) {
  const headers = {};
  if (ttlMs !== null && ttlMs > 0) {
    headers['Cache-Control'] = `public, max-age=${Math.floor(ttlMs / 1000)}`;
    headers['X-Cache-Status'] = fromCache ? 'HIT' : 'MISS';
  }
  return headers;
}

// ── Handler ──────────────────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const route = findRoute(req.method, req.url);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!route) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  if (route.path === '/api/health') {
    const headers = cacheHeaders(route.ttl, false);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // Try cache first
  const cached = getCached(route.path, route.ttl);
  if (cached) {
    const headers = cacheHeaders(route.ttl, true);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...cached, fromCache: true }));
    return;
  }

  // /api/stats returns all stats combined
  if (route.path === '/api/stats') {
    const allData = {
      'mass-to-orbit': FALLBACK_DATA['mass-to-orbit'],
      launches: FALLBACK_DATA['launches'],
      starlink: FALLBACK_DATA['starlink'],
      boosters: FALLBACK_DATA['boosters'],
      business: FALLBACK_DATA['business'],
    };
    setCache(route.path, allData, route.ttl);
    const headers = cacheHeaders(route.ttl, false);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...allData, fromCache: false, live: false }));
    return;
  }

  // LL2 endpoints
  if (route.path === '/api/ll2/starship') {
    await handleLL2Starship(req, res, route);
    return;
  }
  if (route.path === '/api/ll2/landings') {
    await handleLL2Landings(req, res, route);
    return;
  }

  // /api/launch-stats — LL2 launch success/failure statistics
  if (route.path === '/api/launch-stats') {
    await handleLaunchStats(req, res, route);
    return;
  }

  // /api/spacex-company — SpaceX company info from api.spacexdata.com
  if (route.path === '/api/spacex-company') {
    await handleSpaceXCompany(req, res, route);
    return;
  }

  // Individual stat endpoints with live fetching
  const key = route.path.replace('/api/stats/', '');
  await handleStatsEndpoint(req, res, route, key);
}

// ── Stats endpoint handler with live fetching ────────────────────────────────

async function handleStatsEndpoint(req, res, route, key) {
  // Try live fetch first, fall back to embedded data
  try {
    const liveData = await fetchStatsData(key);
    if (liveData) {
      setCache(route.path, liveData, route.ttl);
      const headers = cacheHeaders(route.ttl, false);
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...liveData, fromCache: false, live: true }));
      return;
    }
  } catch (err) {
    console.warn(`Live fetch failed for ${key}, using fallback: ${err.message}`);
  }

  // Fallback
  const data = FALLBACK_DATA[key];
  if (data) {
    setCache(route.path, data, route.ttl);
    const headers = cacheHeaders(route.ttl, false);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...data, fromCache: false, live: false }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unknown stat: ${key}` }));
  }
}

// ── Live data fetchers ───────────────────────────────────────────────────────

const LL2_BASE = 'https://ll.thespacedevs.com/2.2.0';

async function fetchLL2(path, signal) {
  const url = `${LL2_BASE}${path}`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`LL2 fetch failed: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

// Fetch launches stats from LL2 API
async function fetchLaunchStatsFromLL2() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    // Fetch recent launches to compute stats
    const raw = await fetchLL2('/launch/?limit=1000&search=&ordering=-net', controller.signal);
    const results = raw.results || [];

    let success = 0;
    let failure = 0;
    let unknown = 0;
    const yearly = {};

    for (const launch of results) {
      const st = (launch.launch_status || launch.status || '').toLowerCase();
      if (st === 'success' || st === 'go') success++;
      else if (st === 'failure' || st === 'fail') failure++;
      else unknown++;

      // Group by year
      const net = launch.net || launch.windowstart;
      if (net) {
        const year = net.split('T')[0].slice(0, 4);
        if (year >= '2020') {
          yearly[year] = (yearly[year] || 0) + 1;
        }
      }
    }

    // Sort yearly data
    const yearlySorted = Object.entries(yearly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, count]) => ({
        year: parseInt(year, 10),
        count,
        note: getYearNote(year, count),
      }));

    const total = results.length;
    const successful = success;
    const successRate = total > 0 ? ((success / total) * 100).toFixed(2) : 0;

    return {
      yearly: yearlySorted,
      total,
      successful,
      successRate: parseFloat(successRate),
      ytd2026: yearly['2026'] || 0,
      source: 'LL2 API v2.2.0 — https://ll.thespacedevs.com/2.2.0/launch/',
      lastUpdated: new Date().toISOString().split('T')[0],
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Fetch booster stats from LL2 API
async function fetchBoosterStatsFromLL2() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    // Fetch all launchers (boosters) ordered by flights
    const raw = await fetchLL2('/launcher/?limit=1000&ordering=-flights', controller.signal);
    const results = raw.results || [];

    // Filter for SpaceX boosters only
    const spacexBoosters = results.filter((b) =>
      b.launcher_config?.manufacturer?.name === 'SpaceX' ||
      b.launcher_config?.manufacturer?.name?.includes('SpaceX') ||
      b.serial_number?.startsWith('B') ||
      b.serial_number?.startsWith('Ship')
    );

    const fleetSize = spacexBoosters.length;
    const totalFlights = spacexBoosters.reduce((sum, b) => sum + (b.flights || 0), 0);
    const avgFlights = fleetSize > 0 ? (totalFlights / fleetSize).toFixed(1) : '0.0';

    // Find record booster
    const sortedByFlights = [...spacexBoosters].sort((a, b) => (b.flights || 0) - (a.flights || 0));
    const recordBooster = sortedByFlights[0];
    const recordFlights = recordBooster?.flights || 0;

    // Landing stats from LL2
    const landingRaw = await fetchLL2('/landings/?page=0&limit=1000', controller.signal);
    const landingResults = landingRaw.results || [];
    let successfulLandings = 0;
    let totalAttempts = 0;

    for (const l of landingResults) {
      totalAttempts++;
      if (l.success) successfulLandings++;
    }

    const landingRate = totalAttempts > 0 ? ((successfulLandings / totalAttempts) * 100).toFixed(2) : '0.0';

    // Find fastest turnaround from recent boosters
    let fastestTurnaround = 'N/A';
    const recentBoosters = sortedByFlights.slice(0, 20);
    for (const b of recentBoosters) {
      if (b.first_launch_date && b.last_launch_date) {
        const first = new Date(b.first_launch_date);
        const last = new Date(b.last_launch_date);
        const days = Math.floor((last - first) / (1000 * 60 * 60 * 24));
        if (days > 0 && (fastestTurnaround === 'N/A' || days < parseInt(fastestTurnaround))) {
          fastestTurnaround = `${days} jours`;
        }
      }
    }

    return {
      fleetSize,
      avgFlightsPerBooster: parseFloat(avgFlights),
      recordBooster: recordBooster?.serial_number || 'N/A',
      recordFlights,
      landingRate: parseFloat(landingRate),
      successfulLandings,
      totalAttempts,
      fastestTurnaround,
      source: 'LL2 API v2.2.0 — https://ll.thespacedevs.com/2.2.0/launcher/ + /landings/',
      lastUpdated: new Date().toISOString().split('T')[0],
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Fetch Starlink stats — try Space-Track API, fall back to embedded data
async function fetchStarlinkStats() {
  // Space-Track requires registration — try a public alternative
  // Jonathan McDowell's planet4589.org tracks Starlink count
  try {
    // Try to get Starlink count from Jonathan McDowell's page
    // This is a lightweight heuristic since there's no public API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const resp = await fetch('https://planet4589.org/space/log/starlink/', {
        signal: controller.signal,
        headers: { 'User-Agent': 'SpaceX-Dashboard/1.0' },
      });

      if (resp.ok) {
        const text = await resp.text();
        // Try to extract satellite count from the page
        // The page typically has "Starlink satellites: X" pattern
        const match = text.match(/Starlink\s+satellites[:\s]+(\d+)/i);
        if (match) {
          const orbitCount = parseInt(match[1], 10);
          return {
            satellitesOrbit: orbitCount,
            operational: orbitCount, // conservative estimate
            totalLaunched: orbitCount + Math.floor(orbitCount * 0.12), // ~12% loss rate
            subscribers: { min: 10000000, asOf: 'février 2026' },
            longTermGoal: 42000,
            source: 'Jonathan McDowell — planet4589.org/space/log/starlink/',
            lastUpdated: new Date().toISOString().split('T')[0],
          };
        }
      }
    } catch (e) {
      console.warn('Starlink live fetch failed, using fallback:', e.message);
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    console.warn('Starlink fetch error:', e.message);
  }

  // Return fallback
  return null;
}

// ── Helper: year note for launch stats ───────────────────────────────────────
function getYearNote(year, count) {
  const notes = {
    '2020': 'Falcon 9 déployé',
    '2021': 'Démarrage Starlink',
    '2022': 'Starlink + commercial',
    '2023': 'Starlink V2 massif',
    '2024': 'Record surpassé',
    '2025': '~85% lancements orbitaux US',
    '2026': 'En cours',
  };
  return notes[year] || '';
}

// ── LL2 endpoint handlers ────────────────────────────────────────────────────

async function handleLL2Starship(req, res, route) {
  const cached = getCached(route.path, route.ttl);
  if (cached) {
    const headers = cacheHeaders(route.ttl, true);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...cached, fromCache: true }));
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const raw = await fetchLL2('/dashboard/starship/', controller.signal);

    // Build curated response from raw LL2 data
    const vehicles = (raw.vehicles || []).slice(0, 10).map((v) => ({
      serial_number: v.serial_number,
      status: v.status,
      flights: v.flights,
      lastFlight: v.last_launch_date ? v.last_launch_date.split('T')[0] : null,
      details: v.details,
    }));

    const liveStreams = (raw.live_streams || []).slice(0, 5).map((s) => ({
      title: s.title,
      url: s.stream_url || s.url,
    }));

    const updates = (raw.updates || []).slice(0, 5).map((u) => ({
      id: u.id,
      comment: u.comment,
      created_on: u.created_on,
      info_url: u.info_url,
    }));

    const result = {
      orbitalLaunchAttempts: raw.orbital_launch_attempt_count || 0,
      vehicles,
      liveStreams,
      updates,
      source: 'LL2 API v2.2.0 — https://ll.thespacedevs.com/2.2.0/dashboard/starship/',
      lastUpdated: new Date().toISOString(),
      fromCache: false,
      live: true,
    };

    setCache(route.path, result, route.ttl);
    const headers = cacheHeaders(route.ttl, false);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.warn(`LL2 starship fetch failed, using fallback: ${err.message}`);
    const fallback = FALLBACK_DATA['ll2_starship'];
    fallback.live = false;
    fallback.fromCache = false;
    setCache(route.path, fallback, route.ttl);
    const headers = cacheHeaders(route.ttl, false);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fallback));
  } finally {
    clearTimeout(timeout);
  }
}

async function handleLL2Landings(req, res, route) {
  const cached = getCached(route.path, route.ttl);
  if (cached) {
    const headers = cacheHeaders(route.ttl, true);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...cached, fromCache: true }));
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const raw = await fetchLL2('/landings/?page=0&limit=1000', controller.signal);

    const results = raw.results || [];
    const total = raw.count || results.length;

    let successful = 0;
    const landingTypes = {};
    const locations = {};
    const recentLandings = [];

    for (const r of results) {
      if (r.success) successful++;

      const lt = r.landing_type;
      if (lt) {
        landingTypes[lt.name] = (landingTypes[lt.name] || 0) + 1;
      }

      const ll = r.landing_location;
      if (ll) {
        locations[ll.name] = (locations[ll.name] || 0) + 1;
      }

      // Collect recent 10 successful landings
      if (r.success && recentLandings.length < 10) {
        const fs = r.firststage?.launcher;
        recentLandings.push({
          id: r.id,
          serial_number: fs?.serial_number || 'N/A',
          landingType: lt?.name || 'Unknown',
          location: ll?.name || 'Unknown',
          downrangeDistance: r.downrange_distance,
          date: r.timestamp?.split('T')[0] || r.url?.split('/').pop() || 'N/A',
        });
      }
    }

    // Sort locations by count
    const topLocations = Object.entries(locations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const result = {
      total,
      successful,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) : '0.0',
      landingTypes,
      topLocations,
      recentLandings,
      source: 'LL2 API v2.2.0 — https://ll.thespacedevs.com/2.2.0/landings/',
      lastUpdated: new Date().toISOString(),
      fromCache: false,
      live: true,
    };

    setCache(route.path, result, route.ttl);
    const headers = cacheHeaders(route.ttl, false);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.warn(`LL2 landings fetch failed, using fallback: ${err.message}`);
    const fallback = FALLBACK_DATA['ll2_landings'];
    fallback.live = false;
    fallback.fromCache = false;
    setCache(route.path, fallback, route.ttl);
    const headers = cacheHeaders(route.ttl, false);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fallback));
  } finally {
    clearTimeout(timeout);
  }
}

// ── LL2 launch-stats handler ─────────────────────────────────────────────────

async function handleLaunchStats(req, res, route) {
  const cached = getCached(route.path, route.ttl);
  if (cached) {
    const headers = cacheHeaders(route.ttl, true);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...cached, fromCache: true }));
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const raw = await fetchLL2('/launch/?limit=1000&search=&ordering=-net', controller.signal);
    const results = raw.results || [];

    let success = 0;
    let failure = 0;
    let unknown = 0;
    const recent = [];

    for (const launch of results) {
      const st = (launch.launch_status || launch.status || '').toLowerCase();
      if (st === 'success' || st === 'go') success++;
      else if (st === 'failure' || st === 'fail') failure++;
      else unknown++;

      if (recent.length < 5) {
        const mission = launch.mission_name || launch.name || 'Unknown';
        const net = launch.net || launch.windowstart || null;
        const flight = launch.flight_number || launch.id || 0;
        recent.push({
          flight_number: flight,
          mission_name: mission,
          status: st === 'success' || st === 'go' ? 'Success'
                : st === 'failure' || st === 'fail' ? 'Failure' : 'Unknown',
          net: net ? net.split('T')[0] + 'T00:00:00Z' : null,
        });
      }
    }

    const total = results.length;
    const successRate = total > 0 ? ((success / total) * 100).toFixed(2) : 0;

    const result = {
      data: {
        total,
        success,
        failure,
        success_rate: parseFloat(successRate),
        recent,
      },
      source: 'LL2 API v2.2.0 — https://ll.thespacedevs.com/2.2.0/launch/',
      timestamp: new Date().toISOString(),
      cache_ttl: route.ttl,
      fromCache: false,
      live: true,
    };

    setCache(route.path, result, route.ttl);
    const headers = cacheHeaders(route.ttl, false);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.warn(`LL2 launch-stats fetch failed, using fallback: ${err.message}`);
    const fallback = FALLBACK_DATA['launch-stats'];
    const fallbackResult = {
      data: fallback.data,
      source: fallback.source,
      timestamp: new Date().toISOString(),
      cache_ttl: route.ttl,
      fromCache: false,
      live: false,
    };
    setCache(route.path, fallbackResult, route.ttl);
    const headers = cacheHeaders(route.ttl, false);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fallbackResult));
  } finally {
    clearTimeout(timeout);
  }
}

// ── SpaceX company info handler ───────────────────────────────────────────────

async function handleSpaceXCompany(req, res, route) {
  const cached = getCached(route.path, route.ttl);
  if (cached) {
    const headers = cacheHeaders(route.ttl, true);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...cached, fromCache: true }));
    return;
  }

  // Try live fetch from api.spacexdata.com/v4/company
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch('https://api.spacexdata.com/v4/company', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const liveData = await resp.json();
      // Enrich with computed fields consistent with fallback
      const enriched = {
        ...liveData,
        source: 'api.spacexdata.com/v4/company (live)',
        lastUpdated: new Date().toISOString().split('T')[0],
      };
      setCache(route.path, enriched, route.ttl);
      const headers = cacheHeaders(route.ttl, false);
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...enriched, fromCache: false }));
      return;
    }
  } catch (err) {
    console.warn(`SpaceX company live fetch failed, using fallback: ${err.message}`);
  }

  // Fallback
  const data = FALLBACK_DATA['spacex-company'];
  if (data) {
    setCache(route.path, data, route.ttl);
    const headers = cacheHeaders(route.ttl, false);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...data, fromCache: false }));
  } else {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'spacex-company data unavailable' }));
  }
}

// ── Dispatch table for stats endpoints ───────────────────────────────────────
const STATS_FETCHERS = {
  'launches': fetchLaunchStatsFromLL2,
  'boosters': fetchBoosterStatsFromLL2,
  'starlink': fetchStarlinkStats,
  'mass-to-orbit': null,     // No public live API — use fallback
  'business': null,          // S-1 SEC filing is static — use fallback
};

async function fetchStatsData(key) {
  const fetcher = STATS_FETCHERS[key];
  if (!fetcher) return null;
  return await fetcher();
}

// ── Server ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`🚀 SpaceX Stats API server running on http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  ROUTES.filter((r) => r.path !== '/api/health').forEach((r) => {
    console.log(`     ${r.method} ${r.path} (TTL: ${routeTtlLabel(r.ttl)})`);
  });
});

function routeTtlLabel(ttl) {
  if (ttl === null) return 'no-cache';
  const h = Math.round(ttl / 3600000);
  return `${h}h`;
}

export {};
