import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { UpstreamClient, UpstreamError } from './upstream.js'

const schema = z.object({ ok: z.boolean() })

describe('UpstreamClient', () => {
  it('wraps network failures as a 502 UpstreamError', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNRESET'))
    const client = new UpstreamClient(fetchMock)

    await expect(client.get('https://example.com/a', schema)).rejects.toMatchObject({
      status: 502,
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'The upstream service could not be reached',
    })
  })

  it('reports a distinct message when the request times out', async () => {
    const timeoutError = new DOMException('timed out', 'TimeoutError')
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(timeoutError)
    const client = new UpstreamClient(fetchMock)

    await expect(client.get('https://example.com/a', schema)).rejects.toMatchObject({
      status: 502,
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'The upstream service timed out',
    })
  })

  it('surfaces a numeric retry-after header as a retry timestamp', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('rate limited', { status: 429, headers: { 'retry-after': '30' } }),
    )
    const client = new UpstreamClient(fetchMock)

    const before = Date.now()
    const error = (await client
      .get('https://example.com/a', schema)
      .catch((caught: unknown) => caught)) as UpstreamError
    expect(error).toMatchObject({ status: 502, code: 'UPSTREAM_RESPONSE_ERROR', upstreamStatus: 429 })
    expect(error.retryAt).toBeGreaterThanOrEqual(before + 30_000)
  })

  it('surfaces an HTTP-date retry-after header as a retry timestamp', async () => {
    const retryDate = new Date(Date.now() + 60_000).toUTCString()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('rate limited', { status: 503, headers: { 'retry-after': retryDate } }),
    )
    const client = new UpstreamClient(fetchMock)

    const error = (await client
      .get('https://example.com/a', schema)
      .catch((caught: unknown) => caught)) as UpstreamError
    expect(error.retryAt).toBe(Date.parse(retryDate))
  })

  it('falls back to the x-ratelimit-reset header when retry-after is absent', async () => {
    const resetSeconds = Math.floor(Date.now() / 1_000) + 45
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('rate limited', {
        status: 429,
        headers: { 'x-ratelimit-reset': String(resetSeconds) },
      }),
    )
    const client = new UpstreamClient(fetchMock)

    const error = (await client
      .get('https://example.com/a', schema)
      .catch((caught: unknown) => caught)) as UpstreamError
    expect(error.retryAt).toBe(resetSeconds * 1_000)
  })

  it('returns a null retry timestamp when no retry headers are present', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('server error', { status: 500 }),
    )
    const client = new UpstreamClient(fetchMock)

    const error = (await client
      .get('https://example.com/a', schema)
      .catch((caught: unknown) => caught)) as UpstreamError
    expect(error.retryAt).toBeNull()
  })

  it('rejects invalid JSON bodies', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('not json', { status: 200 }),
    )
    const client = new UpstreamClient(fetchMock)

    await expect(client.get('https://example.com/a', schema)).rejects.toMatchObject({
      status: 502,
      code: 'UPSTREAM_INVALID_JSON',
    })
  })

  it('rejects payloads that do not match the schema', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    )
    const client = new UpstreamClient(fetchMock)

    await expect(client.get('https://example.com/a', schema)).rejects.toMatchObject({
      status: 502,
      code: 'UPSTREAM_INVALID_SHAPE',
    })
  })

  it('caches successful GET responses and avoids a second network call', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    const client = new UpstreamClient(fetchMock)

    const first = await client.get('https://example.com/a', schema, {}, 60)
    const second = await client.get('https://example.com/a', schema, {}, 60)

    expect(first).toEqual({ ok: true })
    expect(second).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends a JSON-encoded body and content-type header for POST requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    const client = new UpstreamClient(fetchMock)

    await client.post('https://example.com/a', { hello: 'world' }, schema)

    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ hello: 'world' }))
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json')
  })
})

describe('UpstreamError', () => {
  it('carries status, code, and retry metadata', () => {
    const error = new UpstreamError('boom', 502, 'UPSTREAM_RESPONSE_ERROR', 503, 12345)

    expect(error.name).toBe('UpstreamError')
    expect(error.message).toBe('boom')
    expect(error.status).toBe(502)
    expect(error.code).toBe('UPSTREAM_RESPONSE_ERROR')
    expect(error.upstreamStatus).toBe(503)
    expect(error.retryAt).toBe(12345)
  })
})
