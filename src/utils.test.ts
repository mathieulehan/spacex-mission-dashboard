import { describe, expect, it } from 'vitest'
import { countdown, formatDate } from './utils'

describe('mission date helpers', () => {
  it('preserves coarse launch precision', () => {
    expect(formatDate('2030-09-01T00:00:00Z', 'Month')).toBe('September 2030')
    expect(formatDate('2030-01-01T00:00:00Z', 'Year')).toBe('2030')
  })
  it('calculates a launch countdown', () => {
    const now = Date.parse('2030-01-01T00:00:00Z')
    expect(countdown('2030-01-03T02:03:04Z', now)).toEqual({
      days: 2,
      hours: 2,
      minutes: 3,
      seconds: 4,
    })
  })
})
