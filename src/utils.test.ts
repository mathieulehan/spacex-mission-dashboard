import { describe, expect, it } from 'vitest'
import { countdown, formatDate, timeUntil } from './utils'

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
  it('formats future refresh estimates', () => {
    const now = Date.parse('2030-01-01T00:00:00Z')
    expect(timeUntil('2030-01-01T01:42:00Z', now)).toBe('in 1h 42m')
    expect(timeUntil('2029-12-31T23:59:00Z', now)).toBe('now')
  })
})
