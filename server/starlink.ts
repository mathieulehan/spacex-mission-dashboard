import {
  STARLINK_BOOTSTRAP_FETCHED_AT,
  STARLINK_BOOTSTRAP_RECORDS,
} from './bootstrap.js'
import type { CacheStore } from './cache-store.js'
import { summarizeStarlink } from './normalize.js'
import { gpRecordsSchema } from './schemas.js'
import { UpstreamError } from './upstream.js'

// CelesTrak blocks requests from cloud/datacenter IP ranges (the class Render
// and most other PaaS hosts run on), so orbital elements are sourced from
// Space-Track's GP API instead, which requires a free account.
const SPACETRACK_LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
const SPACETRACK_QUERY_URL =
  'https://www.space-track.org/basicspacedata/query/class/gp/OBJECT_NAME/STARLINK~~/DECAY_DATE/null-val/orderby/NORAD_CAT_ID%20asc/format/json'
const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1_000
const REQUEST_TIMEOUT_MS = 15_000
const CACHE_KEY = 'spacetrack:starlink'

export type SpaceTrackCredentials = {
  identity: string
  password: string
}

export class StarlinkService {
  private blockedUntil = 0
  private blockedError: UpstreamError | null = null

  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly cache: CacheStore,
    private readonly credentials: SpaceTrackCredentials | null,
  ) {}

  getRetryAt() {
    return this.blockedUntil > Date.now() ? this.blockedUntil : null
  }

  private async login() {
    if (!this.credentials) {
      throw new UpstreamError(
        'Space-Track credentials are not configured',
        503,
        'SPACETRACK_NOT_CONFIGURED',
      )
    }
    let response: Response
    try {
      response = await this.fetchImpl(SPACETRACK_LOGIN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          identity: this.credentials.identity,
          password: this.credentials.password,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'Space-Track login timed out'
          : 'Space-Track could not be reached'
      throw new UpstreamError(message, 502, 'UPSTREAM_UNAVAILABLE')
    }

    if (!response.ok) {
      throw new UpstreamError(
        `Space-Track login returned ${response.status}`,
        502,
        'SPACETRACK_LOGIN_FAILED',
        response.status,
      )
    }

    const cookies =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : (response.headers.get('set-cookie')?.split(/, (?=[^ ;]+=)/) ?? [])
    const sessionCookie = cookies
      .map((cookie) => cookie.split(';')[0]?.trim())
      .filter((cookie): cookie is string => Boolean(cookie))
      .join('; ')

    if (!sessionCookie) {
      throw new UpstreamError(
        'Space-Track did not return a session cookie',
        502,
        'SPACETRACK_LOGIN_FAILED',
      )
    }

    return sessionCookie
  }

  private async fetchRecords() {
    const sessionCookie = await this.login()

    let response: Response
    try {
      response = await this.fetchImpl(SPACETRACK_QUERY_URL, {
        headers: { cookie: sessionCookie, accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'The Space-Track query timed out'
          : 'Space-Track could not be reached'
      throw new UpstreamError(message, 502, 'UPSTREAM_UNAVAILABLE')
    }

    if (!response.ok) {
      throw new UpstreamError(
        `Space-Track returned ${response.status}`,
        502,
        'UPSTREAM_RESPONSE_ERROR',
        response.status,
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new UpstreamError(
        'Space-Track returned invalid JSON',
        502,
        'UPSTREAM_INVALID_JSON',
      )
    }

    const parsed = gpRecordsSchema.safeParse(payload)
    if (!parsed.success) {
      console.error(
        '[starlink] Space-Track schema mismatch. isArray=%s length=%s sample=%s issues=%j',
        Array.isArray(payload),
        Array.isArray(payload) ? payload.length : 'n/a',
        JSON.stringify(payload).slice(0, 500),
        parsed.error.issues.slice(0, 5),
      )
      throw new UpstreamError(
        'The Space-Track response did not match the expected format',
        502,
        'UPSTREAM_INVALID_SHAPE',
      )
    }

    return parsed.data
  }

  async getSummary() {
    const cached = await this.cache.get(CACHE_KEY, gpRecordsSchema)
    const cachedAt = cached
      ? new Date(cached.fetchedAt).toISOString()
      : STARLINK_BOOTSTRAP_FETCHED_AT
    if (
      cached &&
      Date.now() - cached.fetchedAt < REFRESH_INTERVAL_MS
    ) {
      return summarizeStarlink(cached.value, cachedAt, false)
    }
    if (Date.now() < this.blockedUntil && this.blockedError) {
      if (cached) {
        return summarizeStarlink(cached.value, cachedAt, true)
      }
      return summarizeStarlink(
        STARLINK_BOOTSTRAP_RECORDS,
        STARLINK_BOOTSTRAP_FETCHED_AT,
        true,
        true,
      )
    }

    try {
      const records = await this.fetchRecords()
      const fetchedAt = new Date().toISOString()
      await this.cache.set(CACHE_KEY, records, Date.parse(fetchedAt))
      this.blockedUntil = 0
      this.blockedError = null
      return summarizeStarlink(records, fetchedAt, false)
    } catch (error) {
      if (error instanceof UpstreamError) {
        this.blockedUntil = Date.now() + REFRESH_INTERVAL_MS
        this.blockedError = error
      }
      console.error('[starlink] Space-Track fetch failed:', error)
      if (cached) {
        return summarizeStarlink(cached.value, cachedAt, true)
      }
      return summarizeStarlink(
        STARLINK_BOOTSTRAP_RECORDS,
        STARLINK_BOOTSTRAP_FETCHED_AT,
        true,
        true,
      )
    }
  }
}
