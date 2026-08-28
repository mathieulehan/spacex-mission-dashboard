import type { Launch } from './types'

function escapeCalendarText(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;')
}

function calendarTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function launchCalendar(launch: Launch, generatedAt = new Date()) {
  const start = calendarTimestamp(launch.windowStart || launch.net)
  if (!start) return null

  const parsedStart = Date.parse(launch.windowStart || launch.net)
  const parsedEnd = Date.parse(launch.windowEnd)
  const end = calendarTimestamp(
    new Date(
      Number.isFinite(parsedEnd) && parsedEnd > parsedStart
        ? parsedEnd
        : parsedStart + 60 * 60 * 1_000,
    ).toISOString(),
  )
  const title = launch.missionName ?? launch.name
  const description = [
    launch.missionDescription,
    `${launch.rocket}${launch.orbit ? ` to ${launch.orbit}` : ''}`,
    `Status: ${launch.status.name}`,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SpaceX Mission Data//Launch Reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeCalendarText(launch.id)}@spacex-mission-data.local`,
    `DTSTAMP:${calendarTimestamp(generatedAt.toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeCalendarText(title)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `LOCATION:${escapeCalendarText(launch.location ?? launch.pad ?? 'Pending')}`,
    `URL:${launch.sourceUrl}`,
    'STATUS:TENTATIVE',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function launchCalendarHref(launch: Launch) {
  const calendar = launchCalendar(launch)
  return calendar
    ? `data:text/calendar;charset=utf-8,${encodeURIComponent(calendar)}`
    : null
}
