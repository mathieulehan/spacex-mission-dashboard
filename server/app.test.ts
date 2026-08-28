import request from 'supertest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { DiskCache } from './disk-cache.js'

const launch = {
  id: 'launch-1',
  url: 'https://ll.thespacedevs.com/launch-1/',
  name: 'Falcon 9 | Starlink',
  status: { name: 'Go for Launch', abbrev: 'Go', description: 'Confirmed.' },
  last_updated: '2026-08-28T14:50:34Z',
  net: '2030-08-30T11:26:00Z',
  window_start: '2030-08-30T11:26:00Z',
  window_end: '2030-08-30T11:26:00Z',
  net_precision: { name: 'Minute', abbrev: 'MIN', description: 'Minute precision.' },
  probability: 60,
  weather_concerns: null,
  holdreason: '',
  failreason: '',
  launch_service_provider: { name: 'SpaceX' },
  rocket: { configuration: { family: 'Falcon', full_name: 'Falcon 9 Block 5', variant: 'Block 5' } },
  mission: {
    name: 'Starlink Group',
    description: 'A Starlink deployment.',
    type: 'Communications',
    orbit: { name: 'Low Earth Orbit', abbrev: 'LEO' },
  },
  pad: {
    name: 'SLC-40',
    latitude: '28.56',
    longitude: '-80.57',
    location: { name: 'Cape Canaveral, FL, USA', timezone_name: 'America/New_York' },
  },
  webcast_live: false,
  image: null,
}

const event = {
  id: 1512,
  url: 'https://ll.thespacedevs.com/event/1512/',
  name: 'Booster Static Fire',
  last_updated: '2026-08-28T19:41:11Z',
  type: { name: 'Static Fire' },
  description: 'A test firing.',
  webcast_live: false,
  location: 'Starbase Texas',
  news_url: null,
  video_url: 'https://example.com/watch',
  feature_image: null,
  date: '2030-08-29T18:10:00Z',
  date_precision: { name: 'Minute', abbrev: 'MIN', description: 'Minute precision.' },
}

const orbitalRecords = [
  {
    OBJECT_NAME: 'STARLINK-1008',
    OBJECT_ID: '2019-074B',
    EPOCH: '2026-08-28T13:44:26Z',
    MEAN_MOTION: 15.62192031,
    ECCENTRICITY: 0.00037588,
    INCLINATION: 53.1472,
    RA_OF_ASC_NODE: 79.083,
    ARG_OF_PERICENTER: 86.6793,
    MEAN_ANOMALY: 273.4651,
    NORAD_CAT_ID: 44714,
    REV_AT_EPOCH: 37548,
    BSTAR: 0.00086239988,
  },
  {
    OBJECT_NAME: 'STARLINK-1012',
    OBJECT_ID: '2019-074F',
    EPOCH: '2026-08-28T13:34:52Z',
    MEAN_MOTION: 15.62603011,
    ECCENTRICITY: 0.00010033,
    INCLINATION: 53.1497,
    RA_OF_ASC_NODE: 179.3849,
    ARG_OF_PERICENTER: 200.4954,
    MEAN_ANOMALY: 159.6021,
    NORAD_CAT_ID: 44718,
    REV_AT_EPOCH: 37547,
    BSTAR: 0.00091396251,
  },
]

describe('fresh mission data API', () => {
  it('normalizes Launch Library 2 launches', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ count: 127, results: [launch] }), { status: 200 }),
    )
    const app = createApp({ fetchImpl: fetchMock, starlinkCachePath: null, ll2CachePath: null })

    const response = await request(app).get('/api/launches').expect(200)

    expect(response.body.results[0]).toMatchObject({
      missionName: 'Starlink Group',
      rocket: 'Falcon 9 Block 5',
      probability: 60,
    })
    expect(String(fetchMock.mock.calls[0][0])).toContain('ll.thespacedevs.com')
  })

  it('returns the bounded LL2 snapshot when the anonymous limit is active', async () => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'retry-after': '120' },
        }),
      )
      const app = createApp({ fetchImpl: fetchMock, starlinkCachePath: null, ll2CachePath: null })

      const response = await request(app).get('/api/launches').expect(200)

      expect(response.body).toMatchObject({
        stale: true,
        sampled: true,
        total: 127,
      })
      expect(response.body.results[0].id).toBe(
        '521f3a1c-f977-4306-9b7f-495858719adf',
      )
      const cacheStatus = await request(app).get('/api/cache').expect(200)
      const launchStatus = cacheStatus.body.sources.find(
        (source: { key: string }) => source.key === 'll2:launches',
      )
      expect(launchStatus.nextAttemptReason).toBe('LL2 rate-limit window')
      expect(Date.parse(launchStatus.nextAttemptAt)).toBeGreaterThan(Date.now())
  })

  it('persists LL2 data and serves it after a rate limit across restarts', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'll2-cache-'))
    const cachePath = path.join(directory, 'mission-data.sqlite')
    try {
      const successfulFetch = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ count: 127, results: [launch] }), { status: 200 }),
      )
      const firstApp = createApp({
        fetchImpl: successfulFetch,
        starlinkCachePath: null,
        ll2CachePath: cachePath,
      })
      await request(firstApp).get('/api/launches').expect(200)

      const database = new DatabaseSync(cachePath)
      database.exec('UPDATE api_cache SET fetched_at = 0')
      database.close()

      const limitedFetch = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('Rate limit exceeded', { status: 429 }),
      )
      const restartedApp = createApp({
        fetchImpl: limitedFetch,
        starlinkCachePath: null,
        ll2CachePath: cachePath,
      })
      const response = await request(restartedApp).get('/api/launches').expect(200)

      expect(response.body).toMatchObject({
        stale: true,
        sampled: false,
        total: 127,
      })
      expect(response.body.results[0].id).toBe('launch-1')
      expect(limitedFetch).toHaveBeenCalledOnce()
    } finally {
      await rm(directory, { recursive: true })
    }
  })

  it('normalizes Launch Library 2 events', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ count: 1, results: [event] }), { status: 200 }),
    )
    const app = createApp({ fetchImpl: fetchMock, starlinkCachePath: null, ll2CachePath: null })

    const response = await request(app).get('/api/events').expect(200)

    expect(response.body.results[0]).toMatchObject({
      name: 'Booster Static Fire',
      type: 'Static Fire',
    })
  })

  it('returns rich mission detail for a safe launch UUID', async () => {
      const detail = {
        ...launch,
        id: '521f3a1c-f977-4306-9b7f-495858719adf',
        flightclub_url: 'https://flightclub.io/result',
        updates: [
          {
            comment: 'GO for launch.',
            info_url: 'https://example.com/update',
            created_on: '2026-08-28T14:50:00Z',
          },
        ],
        rocket: {
          configuration: {
            ...launch.rocket.configuration,
            description: 'Heavy-lift reusable vehicle.',
            reusable: true,
            length: 70,
            diameter: 12.2,
            launch_cost: '90000000',
            leo_capacity: 63800,
            gto_capacity: 26700,
            total_launch_count: 12,
            successful_launches: 12,
            info_url: 'https://example.com/rocket',
            wiki_url: 'https://example.com/wiki',
          },
          launcher_stage: [
            {
              type: 'Booster',
              reused: true,
              launcher_flight_number: 3,
              launcher: { serial_number: 'B1072', details: 'Flight proven.' },
              landing: {
                attempt: true,
                description: 'Return to launch site.',
                type: { name: 'Return to Launch Site', abbrev: 'RTLS' },
                location: { name: 'Landing Zone 2' },
              },
            },
          ],
        },
        pad: {
          ...launch.pad,
          description: 'Historic launch complex.',
          wiki_url: 'https://example.com/pad',
          map_url: 'https://example.com/map',
        },
        infoURLs: [
          {
            title: 'Official mission page',
            description: null,
            url: 'https://example.com/mission',
            source: 'spacex.com',
            type: { name: 'Official Page' },
            start_time: null,
          },
        ],
        vidURLs: [],
        timeline: [
          {
            type: { abbrev: 'Liftoff', description: 'First upward movement.' },
            relative_time: 'P0D',
          },
        ],
      }
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(detail), { status: 200 }),
      )
      const app = createApp({ fetchImpl: fetchMock, starlinkCachePath: null, ll2CachePath: null })

      const response = await request(app)
        .get('/api/launches/521f3a1c-f977-4306-9b7f-495858719adf')
        .expect(200)

      expect(response.body.rocketDetails.leoCapacityKg).toBe(63800)
      expect(response.body.stages[0].serialNumber).toBe('B1072')
      expect(response.body.timeline[0].label).toBe('Liftoff')
  })

  it('rejects unsafe mission detail identifiers without calling LL2', async () => {
      const fetchMock = vi.fn<typeof fetch>()
      const app = createApp({ fetchImpl: fetchMock, starlinkCachePath: null, ll2CachePath: null })

      await request(app).get('/api/launches/not-a-uuid').expect(400)
      expect(fetchMock).not.toHaveBeenCalled()
  })

  it('summarizes CelesTrak orbital elements', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(orbitalRecords), { status: 200 }),
    )
    const app = createApp({ fetchImpl: fetchMock, starlinkCachePath: null, ll2CachePath: null })

    const response = await request(app).get('/api/starlink').expect(200)

    expect(response.body.count).toBe(2)
    expect(response.body.averageInclination).toBeCloseTo(53.14845)
    expect(response.body.averageAltitudeKm).toBeGreaterThan(300)
    expect(response.body.satellites[0].noradId).toBe(44714)
    expect(response.body.positions).toHaveLength(2)
    expect(response.body.positions[0].latitude).toBeGreaterThanOrEqual(-90)
    expect(response.body.positions[0].latitude).toBeLessThanOrEqual(90)
    expect(response.body.positions[0].longitude).toBeGreaterThanOrEqual(-180)
    expect(response.body.positions[0].longitude).toBeLessThanOrEqual(180)
    expect(String(fetchMock.mock.calls[0][0])).toContain('celestrak.org')
  })

  it('reuses a fresh persistent CelesTrak cache without downloading again', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'starlink-cache-'))
    const cachePath = path.join(directory, 'mission-data.sqlite')
    try {
      new DiskCache(cachePath).set('celestrak:starlink', orbitalRecords)
      const fetchMock = vi.fn<typeof fetch>()
      const app = createApp({ fetchImpl: fetchMock, starlinkCachePath: cachePath, ll2CachePath: null })

      const response = await request(app).get('/api/starlink').expect(200)

      expect(response.body.count).toBe(2)
      expect(response.body.stale).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      await rm(directory, { recursive: true })
    }
  })

  it('reports safe metadata for the shared cache database', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cache-status-'))
    const cachePath = path.join(directory, 'mission-data.sqlite')
    try {
      const cache = new DiskCache(cachePath)
      cache.set('ll2:launches', { count: 127, results: [launch] })
      cache.set('celestrak:starlink', orbitalRecords)
      cache.set(
        'll2:launch:521f3a1c-f977-4306-9b7f-495858719adf',
        { privatePayload: 'not returned' },
      )
      const app = createApp({
        fetchImpl: vi.fn<typeof fetch>(),
        ll2CachePath: cachePath,
      })

      const response = await request(app).get('/api/cache').expect(200)

      expect(response.body.missionDetailsStored).toBe(1)
      expect(response.body.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'll2:launches',
            fresh: true,
          }),
          expect.objectContaining({
            key: 'celestrak:starlink',
            fresh: true,
          }),
        ]),
      )
      expect(JSON.stringify(response.body)).not.toContain('privatePayload')
    } finally {
      await rm(directory, { recursive: true })
    }
  })

  it('rejects malformed upstream payloads', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    )
    const app = createApp({ fetchImpl: fetchMock, starlinkCachePath: null, ll2CachePath: null })

    const response = await request(app).get('/api/launches').expect(502)
    expect(response.body.error.code).toBe('UPSTREAM_INVALID_SHAPE')
  })

  it('backs off after a CelesTrak cooldown response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('Download cooldown active', { status: 403 }),
    )
    const app = createApp({ fetchImpl: fetchMock, starlinkCachePath: null, ll2CachePath: null })

    const first = await request(app).get('/api/starlink').expect(200)
    const second = await request(app).get('/api/starlink').expect(200)

    expect(first.body).toMatchObject({ stale: true, sampled: true, count: 6 })
    expect(second.body).toMatchObject({ stale: true, sampled: true, count: 6 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const cacheStatus = await request(app).get('/api/cache').expect(200)
    const starlinkStatus = cacheStatus.body.sources.find(
      (source: { key: string }) => source.key === 'celestrak:starlink',
    )
    expect(starlinkStatus.nextAttemptReason).toBe('CelesTrak cooldown')
    expect(Date.parse(starlinkStatus.nextAttemptAt)).toBeGreaterThan(Date.now())
  })
})
