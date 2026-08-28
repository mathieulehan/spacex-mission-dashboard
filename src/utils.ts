export function formatDate(value: string, precision = 'Minute') {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  const normalized = precision.toLowerCase()
  if (normalized === 'year') return String(date.getUTCFullYear())
  if (normalized === 'quarter') {
    return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`
  }
  if (normalized === 'month') {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date)
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    ...(normalized !== 'day' && { timeStyle: 'short' }),
    timeZone: 'UTC',
  }).format(date)
}
export function countdown(value: string, now = Date.now()) {
  const difference = Date.parse(value) - now
  if (!Number.isFinite(difference) || difference <= 0) return null
  const seconds = Math.floor(difference / 1_000)
  return {
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3_600),
    minutes: Math.floor((seconds % 3_600) / 60),
    seconds: seconds % 60,
  }
}

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

export function relativeTime(value: string) {
  const difference = Date.now() - Date.parse(value)
  if (!Number.isFinite(difference)) return 'unknown'
  const minutes = Math.round(difference / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
