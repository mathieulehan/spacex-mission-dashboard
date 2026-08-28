import type { ZodType } from 'zod'

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly upstreamStatus: number | null = null,
    readonly retryAt: number | null = null,
  ) {
    super(message)
    this.name = 'UpstreamError'
  }
}

function retryTimestamp(response: Response) {
  const retryAfter = response.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Date.now() + seconds * 1_000
    const timestamp = Date.parse(retryAfter)
    if (Number.isFinite(timestamp)) return timestamp
  }

  const rateLimitReset = Number(response.headers.get('x-ratelimit-reset'))
  return Number.isFinite(rateLimitReset) && rateLimitReset > 0
    ? rateLimitReset * 1_000
    : null
}

type CacheEntry = {
  expiresAt: number
  value: unknown
}

export class UpstreamClient {
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 8_000,
  ) {}

  async get<T>(
    url: string,
    schema: ZodType<T>,
    options: RequestInit = {},
    cacheSeconds = 60,
  ): Promise<T> {
    return this.request(url, schema, options, cacheSeconds)
  }

  async post<T>(
    url: string,
    body: unknown,
    schema: ZodType<T>,
    cacheSeconds = 20,
  ): Promise<T> {
    return this.request(
      url,
      schema,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      cacheSeconds,
    )
  }

  private async request<T>(
    url: string,
    schema: ZodType<T>,
    options: RequestInit,
    cacheSeconds: number,
  ): Promise<T> {
    const cacheKey = `${options.method ?? 'GET'}:${url}:${options.body ?? ''}`
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T
    }

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'The upstream service timed out'
          : 'The upstream service could not be reached'
      throw new UpstreamError(message, 502, 'UPSTREAM_UNAVAILABLE')
    }

    if (!response.ok) {
      throw new UpstreamError(
        `The upstream service returned ${response.status}`,
        502,
        'UPSTREAM_RESPONSE_ERROR',
        response.status,
        retryTimestamp(response),
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new UpstreamError(
        'The upstream service returned invalid JSON',
        502,
        'UPSTREAM_INVALID_JSON',
      )
    }

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      throw new UpstreamError(
        'The upstream response did not match the expected format',
        502,
        'UPSTREAM_INVALID_SHAPE',
      )
    }

    this.cache.set(cacheKey, {
      expiresAt: Date.now() + cacheSeconds * 1_000,
      value: parsed.data,
    })
    return parsed.data
  }
}
