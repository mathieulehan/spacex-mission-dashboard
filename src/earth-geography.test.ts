import { describe, expect, it } from 'vitest'
import { WORLD_POLYGONS } from './earth-geography'

describe('Natural Earth geography', () => {
  it('contains detailed global coastline geometry', () => {
    const points = WORLD_POLYGONS.reduce(
      (total, polygon) =>
        total +
        polygon.reduce((ringTotal, ring) => ringTotal + ring.length, 0),
      0,
    )

    expect(WORLD_POLYGONS.length).toBeGreaterThan(200)
    expect(points).toBeGreaterThan(5_000)
  })
})
