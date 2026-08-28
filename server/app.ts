import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import helmet from 'helmet'
import { z, type ZodType } from 'zod'
import { DiskCache } from './disk-cache.js'
import {
  LL2_BOOTSTRAP_EVENTS,
  LL2_BOOTSTRAP_LAUNCHES,
} from './ll2-bootstrap.js'
import {
  normalizeEvent,
  normalizeLaunch,
  normalizeLaunchDetail,
} from './normalize.js'
import {
  ll2EventsSchema,
  ll2LaunchDetailSchema,
  ll2LaunchesSchema,
} from './schemas.js'
import { StarlinkService } from './starlink.js'
import { UpstreamClient, UpstreamError } from './upstream.js'

const LL2_BASE_URL = 'https://ll.thespacedevs.com/2.2.0'
const LL2_CACHE_TTL_MS = 10 * 60 * 1_000

type AppOptions = {
  fetchImpl?: typeof fetch
  serveStatic?: boolean
  starlinkCachePath?: string | null
  ll2CachePath?: string | null
}

function route(
  handler: (request: Request, response: Response) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response).catch(next)
  }
}

export function createApp(options: AppOptions = {}) {
  const app = express()
  const upstream = new UpstreamClient(options.fetchImpl, 30_000)
  const ll2Cache = new DiskCache(
    options.ll2CachePath === undefined
      ? path.resolve('.cache/mission-data.sqlite')
      : options.ll2CachePath,
  )
  const starlinkCache =
    options.starlinkCachePath === undefined
      ? ll2Cache
      : new DiskCache(options.starlinkCachePath)
  const starlink = new StarlinkService(upstream, starlinkCache)

  async function getLl2<T>(
    cacheKey: string,
    url: string,
    schema: ZodType<T>,
  ): Promise<{ value: T; stale: boolean }> {
    const cached = ll2Cache.get(cacheKey, schema)
    if (cached && Date.now() - cached.fetchedAt < LL2_CACHE_TTL_MS) {
      return { value: cached.value, stale: false }
    }

    try {
      const value = await upstream.get(
        url,
        schema,
        { headers: { accept: 'application/json' } },
        LL2_CACHE_TTL_MS / 1_000,
      )
      ll2Cache.set(cacheKey, value)
      return { value, stale: false }
    } catch (error) {
      if (cached && error instanceof UpstreamError) {
        return { value: cached.value, stale: true }
      }
      throw error
    }
  }

  app.disable('x-powered-by')
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(express.json({ limit: '32kb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' })
  })

  app.get('/api/cache', (_request, response) => {
    const metadata = ll2Cache.metadata()
    const byKey = new Map(metadata.map((entry) => [entry.key, entry]))
    const sources = [
      { key: 'll2:launches', label: 'LL2 launches', ttlMs: LL2_CACHE_TTL_MS },
      { key: 'll2:events', label: 'LL2 events', ttlMs: LL2_CACHE_TTL_MS },
      {
        key: 'celestrak:starlink',
        label: 'CelesTrak Starlink',
        ttlMs: 2 * 60 * 60 * 1_000,
      },
    ].map(({ key, label, ttlMs }) => {
      const entry = byKey.get(key)
      return {
        key,
        label,
        fetchedAt: entry ? new Date(entry.fetchedAt).toISOString() : null,
        refreshAfter: entry
          ? new Date(entry.fetchedAt + ttlMs).toISOString()
          : null,
        sizeBytes: entry?.sizeBytes ?? 0,
        fresh: Boolean(entry && Date.now() - entry.fetchedAt < ttlMs),
      }
    })

    response.json({
      sources,
      missionDetailsStored: metadata.filter((entry) =>
        entry.key.startsWith('ll2:launch:'),
      ).length,
    })
  })

  app.get(
    '/api/launches',
    route(async (_request, response) => {
      const url = new URL(`${LL2_BASE_URL}/launch/upcoming/`)
      url.search = new URLSearchParams({
        format: 'json',
        search: 'SpaceX',
        limit: '6',
        ordering: 'net',
      }).toString()
      try {
        const launches = await getLl2(
          'll2:launches',
          url.toString(),
          ll2LaunchesSchema,
        )
        response.json({
          total: launches.value.count,
          stale: launches.stale,
          sampled: false,
          results: launches.value.results.map(normalizeLaunch),
        })
      } catch (error) {
        if (error instanceof UpstreamError && error.message.includes('429')) {
          response.json(LL2_BOOTSTRAP_LAUNCHES)
          return
        }
        throw error
      }
    }),
  )

  app.get(
    '/api/launches/:id',
    route(async (request, response) => {
      const id = z.string().uuid().parse(request.params.id)
      const detail = await getLl2(
        `ll2:launch:${id}`,
        `${LL2_BASE_URL}/launch/${id}/?format=json`,
        ll2LaunchDetailSchema,
      )
      response.json({
        ...normalizeLaunchDetail(detail.value),
        stale: detail.stale,
      })
    }),
  )

  app.get(
    '/api/events',
    route(async (_request, response) => {
      const url = new URL(`${LL2_BASE_URL}/event/upcoming/`)
      url.search = new URLSearchParams({
        format: 'json',
        search: 'SpaceX',
        limit: '4',
        ordering: 'date',
      }).toString()
      try {
        const events = await getLl2(
          'll2:events',
          url.toString(),
          ll2EventsSchema,
        )
        response.json({
          total: events.value.count,
          stale: events.stale,
          sampled: false,
          results: events.value.results.map(normalizeEvent),
        })
      } catch (error) {
        if (error instanceof UpstreamError && error.message.includes('429')) {
          response.json(LL2_BOOTSTRAP_EVENTS)
          return
        }
        throw error
      }
    }),
  )

  app.get(
    '/api/starlink',
    route(async (_request, response) => {
      response.json(await starlink.getSummary())
    }),
  )

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    void _next
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'The request is invalid' },
      })
      return
    }
    if (error instanceof UpstreamError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message },
      })
      return
    }
    console.error(error)
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    })
  }

  app.use(errorHandler)

  if (options.serveStatic) {
    const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
    const clientDirectory = path.resolve(currentDirectory, '../dist')
    app.use(express.static(clientDirectory))
    app.get('/{*path}', (_request, response) => {
      response.sendFile(path.join(clientDirectory, 'index.html'))
    })
  }

  return app
}
