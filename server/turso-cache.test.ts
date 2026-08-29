import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { TursoCache } from './turso-cache.js'

describe('TursoCache', () => {
  it('stores validated values and cache metadata through libSQL', async () => {
    const cache = new TursoCache('file::memory:')
    const schema = z.object({ missions: z.number() })
    try {
      await cache.set('test:missions', { missions: 6 }, 1_800_000)

      await expect(cache.get('test:missions', schema)).resolves.toEqual({
        value: { missions: 6 },
        fetchedAt: 1_800_000,
      })
      await expect(cache.metadata()).resolves.toEqual([
        expect.objectContaining({
          key: 'test:missions',
          fetchedAt: 1_800_000,
        }),
      ])
    } finally {
      cache.close()
    }
  })

  it('compresses large payloads while preserving validated cache values', async () => {
    const cache = new TursoCache('file::memory:')
    const records = Array.from({ length: 12_000 }, (_, index) => ({
      id: index,
      name: `STARLINK-${index}`,
      repeated: 'orbital-data'.repeat(30),
    }))
    const schema = z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        repeated: z.string(),
      }),
    )
    try {
      await cache.set('test:large', records)

      await expect(cache.get('test:large', schema)).resolves.toEqual(
        expect.objectContaining({ value: records }),
      )
      const [metadata] = await cache.metadata()
      expect(metadata.sizeBytes).toBeLessThan(
        Buffer.byteLength(JSON.stringify(records)) / 2,
      )
    } finally {
      cache.close()
    }
  })
})
