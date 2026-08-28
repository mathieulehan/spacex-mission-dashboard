import { describe, expect, it } from 'vitest'
import { positionToCartesian } from './earth-geometry'

describe('positionToCartesian', () => {
  it('places equatorial and polar coordinates on a sphere', () => {
    expect(positionToCartesian(0, 0, 2)).toEqual({ x: 2, y: 0, z: -0 })

    const northPole = positionToCartesian(90, 45, 1)
    expect(northPole.y).toBeCloseTo(1)
    expect(northPole.x).toBeCloseTo(0)
    expect(northPole.z).toBeCloseTo(0)
  })
})
