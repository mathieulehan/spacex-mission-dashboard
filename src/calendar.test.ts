import { describe, expect, it } from 'vitest'
import { launchCalendar } from './calendar'
import { launchesFixture } from './test/fixtures'

describe('launchCalendar', () => {
  it('creates a portable calendar event from a launch window', () => {
    const calendar = launchCalendar(
      launchesFixture.results[0],
      new Date('2026-08-28T20:00:00Z'),
    )

    expect(calendar).toContain('DTSTART:20300830T112600Z')
    expect(calendar).toContain('DTEND:20300830T122600Z')
    expect(calendar).toContain('SUMMARY:Roman Space Telescope')
    expect(calendar).toContain('LOCATION:Kennedy Space Center\\, FL\\, USA')
    expect(calendar).toContain('STATUS:TENTATIVE')
  })
})
