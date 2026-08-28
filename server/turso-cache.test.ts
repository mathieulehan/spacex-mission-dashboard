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
})
