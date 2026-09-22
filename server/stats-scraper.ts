import type { StatsSnapshot } from './stats-types.js'
import { STATS_FALLBACK_SNAPSHOT } from './stats-fallback.js'
import { ZodError } from 'zod'
import { UpstreamError } from './upstream.js'

const SPACEXNOW_STATS_URL = 'https://spacexnow.com/stats'

type ParsedStats = {
  totalLaunches?: number
  totalSuccessRate?: number
  falcon9Launches?: number
  falcon9SuccessRate?: number
  falconHeavyLaunches?: number
  falconHeavySuccessRate?: number
  starshipLaunches?: number
  starshipSuccessRate?: number
  boosterReflights?: number
  boosterLandingSuccessRate?: number
  maxBoosterFlights?: number
  starlinkSatsInOrbit?: number
  launchesThisYear?: number
  launchesThisYearGoal?: number
  fastestTurnaroundMinutes?: number
  fastestBoosterTurnaroundDays?: number
  busiestLaunchSiteName?: string
  busiestLaunchSiteLaunches?: number
  capsuleReflights?: number
  capsuleLandingSuccessRate?: number
  crewFlownTotal?: number
  dragonCargoMassUp?: number
  dragonCargoMassDown?: number
}

// ---------------------------------------------------------------------------
// HTML scraping helpers for spacexnow.com/stats
// ---------------------------------------------------------------------------

interface TableSection {
  heading: string
  rows: Array<{ label: string; value: string; extra?: string }>
}

function parseHTMLError(message: string): UpstreamError {
  return new UpstreamError(message, 502, 'UPSTREAM_INVALID_SHAPE')
}

function extractText(node: ParentNode | null): string {
  if (!node) return ''
  if (node.textContent != null) return node.textContent
  return ''
}

function parseValue(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function parseTableSection(article: Element): TableSection | null {
  const heading = article.querySelector('h3')
  if (!heading) return null
  const rows: Array<{ label: string; value: string; extra?: string }> = []
  const rowsElements = article.querySelectorAll('tr')
  for (const tr of rowsElements) {
    const cells = tr.querySelectorAll('th, td')
    if (cells.length < 2) continue
    const label = parseValue(extractText(cells[0]))
    const value = parseValue(extractText(cells[1]))
    const extra = cells.length > 2 ? parseValue(extractText(cells[2])) : undefined
    if (label && value) {
      rows.push({ label, value, extra })
    }
  }
  return { heading: parseValue(extractText(heading)), rows }
}

function parseHtmlDocument(html: string): Document {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  if (!doc.querySelectorAll('h3').length) {
    throw parseHTMLError('spacexnow.com returned an empty or invalid page')
  }
  return doc
}

function parseLaunchCounts(section: TableSection | null): ParsedStats {
  if (!section) return {}
  const out: ParsedStats = {}
  for (const row of section.rows) {
    if (row.label === 'Total') {
      const [success, total, rate] = row.value.split('/')
      if (total) out.totalLaunches = parseInt(total.replace(/[^0-9]/g, ''), 10) || undefined
      if (rate) out.totalSuccessRate = parseFloat(rate.replace(/[^0-9.]/g, '')) || undefined
    }
    if (row.label === 'Falcon 9') {
      const [success, total, rate] = row.value.split('/')
      if (total) out.falcon9Launches = parseInt(total.replace(/[^0-9]/g, ''), 10) || undefined
      if (rate) out.falcon9SuccessRate = parseFloat(rate.replace(/[^0-9.]/g, '')) || undefined
    }
    if (row.label === 'Falcon Heavy') {
      const [success, total, rate] = row.value.split('/')
      if (total) out.falconHeavyLaunches = parseInt(total.replace(/[^0-9]/g, ''), 10) || undefined
      if (rate) out.falconHeavySuccessRate = parseFloat(rate.replace(/[^0-9.]/g, '')) || undefined
    }
    if (row.label === 'Starship') {
      const [success, total, rate] = row.value.split('/')
      if (total) out.starshipLaunches = parseInt(total.replace(/[^0-9]/g, ''), 10) || undefined
      if (rate) out.starshipSuccessRate = parseFloat(rate.replace(/[^0-9.]/g, '')) || undefined
    }
    if (row.label === 'Landed' && row.extra === 'Block 5') {
      // skip, covered by boosterLandingSuccessRate below
    }
  }
  return out
}

function parseBoosterReuse(section: TableSection | null): ParsedStats {
  if (!section) return {}
  const out: ParsedStats = {}
  for (const row of section.rows) {
    if (row.label === 'Reflown') {
      const match = row.value.match(/([0-9,]+)/)
      if (match) out.boosterReflights = parseInt(match[1].replace(/,/g, ''), 10) || undefined
    }
    if (row.label === 'Landed') {
      const [success, total, rate] = row.value.split('/')
      if (total) out.boosterLandingSuccessRate = parseFloat(rate.replace(/[^0-9.]/g, '')) || undefined
    }
    if (row.label === 'Most flights') {
      const match = row.value.match(/([0-9]+)/)
      if (match) out.maxBoosterFlights = parseInt(match[1], 10) || undefined
    }
  }
  return out
}

function parseLaunchesPerYear(section: TableSection | null): ParsedStats {
  if (!section) return {}
  const out: ParsedStats = {}
  for (const row of section.rows) {
    if (row.label === 'Most in a year') {
      const match = row.value.match(/([0-9]+)/)
      if (match) out.launchesThisYear = parseInt(match[1], 10) || undefined
    }
    if (row.label === 'Launch goal 2026') {
      const [current, goal] = row.value.split('/')
      if (current) out.launchesThisYear = parseInt(current.replace(/[^0-9]/g, ''), 10) || undefined
      if (goal) out.launchesThisYearGoal = parseInt(goal.replace(/[^0-9]/g, ''), 10) || undefined
    }
  }
  return out
}

function parseTurnarounds(section: TableSection | null): ParsedStats {
  if (!section) return {}
  const out: ParsedStats = {}
  for (const row of section.rows) {
    if (row.label === 'Fastest' && row.value.includes('minutes')) {
      const match = row.value.match(/([0-9]+)\s*minutes?,\s*([0-9]+)\s*seconds?/)
      if (match) {
        out.fastestTurnaroundMinutes = parseInt(match[1], 10) + parseInt(match[2], 10) / 60
      }
    }
    if (row.label === 'Booster') {
      const match = row.value.match(/([0-9]+)\s*days?,?\s*([0-9]+)\s*hours?/)
      if (match) {
        out.fastestBoosterTurnaroundDays = parseInt(match[1], 10) + parseInt(match[2], 10) / 24
      }
    }
  }
  return out
}

function parseLaunchSites(section: TableSection | null): ParsedStats {
  if (!section) return {}
  const out: ParsedStats = {}
  let busiestName = ''
  let busiestCount = 0
  for (const row of section.rows) {
    const match = row.value.split('/')[0].replace(/[^0-9]/g, '')
    const count = parseInt(match, 10)
    if (count > busiestCount) {
      busiestCount = count
      busiestName = row.label
    }
  }
  if (busiestCount) {
    out.busiestLaunchSiteName = busiestName
    out.busiestLaunchSiteLaunches = busiestCount
  }
  return out
}

function parseCapsuleReuse(section: TableSection | null): ParsedStats {
  if (!section) return {}
  const out: ParsedStats = {}
  for (const row of section.rows) {
    if (row.label === 'Reflown') {
      const match = row.value.match(/([0-9]+)/)
      if (match) out.capsuleReflights = parseInt(match[1], 10) || undefined
    }
    if (row.label === 'Landed') {
      const [success, total, rate] = row.value.split('/')
      if (total) out.capsuleLandingSuccessRate = parseFloat(rate.replace(/[^0-9.]/g, '')) || undefined
    }
  }
  return out
}

function parseDragon(section: TableSection | null): ParsedStats {
  if (!section) return {}
  const out: ParsedStats = {}
  for (const row of section.rows) {
    if (row.label === 'ISS Cargo') {
      const upMatch = row.value.match(/~?([0-9]+)\s*tonnes?\s*up/)
      const downMatch = row.value.match(/~?([0-9]+)\s*tonnes?\s*down/)
      if (upMatch) out.dragonCargoMassUp = parseInt(upMatch[1], 10) * 1000
      if (downMatch) out.dragonCargoMassDown = parseInt(downMatch[1], 10) * 1000
    }
    if (row.label === 'Crew flown total') {
      const match = row.value.match(/([0-9]+)/)
      if (match) out.crewFlownTotal = parseInt(match[1], 10) || undefined
    }
  }
  return out
}

function parseStarlink(section: TableSection | null): ParsedStats {
  if (!section) return {}
  const out: ParsedStats = {}
  for (const row of section.rows) {
    if (row.label === 'Starlinks in orbit') {
      const match = row.value.match(/([0-9,]+)/)
      if (match) out.starlinkSatsInOrbit = parseInt(match[1].replace(/,/g, ''), 10) || undefined
    }
  }
  return out
}

function parseStatsFromHtml(html: string): ParsedStats {
  const doc = parseHtmlDocument(html)
  const articles = doc.querySelectorAll('main article, .stats section, section article')
  const sections: TableSection[] = []
  for (const el of articles) {
    const section = parseTableSection(el as Element)
    if (section) sections.push(section)
  }
  // Also fall back to any h3 + table grouping anywhere on the page
  if (sections.length === 0) {
    const headings = doc.querySelectorAll('h3')
    for (const h of headings) {
      const parent = h.closest('article, section')
      if (parent) {
        const section = parseTableSection(parent as Element)
        if (section) sections.push(section)
      }
    }
  }
  const merged: ParsedStats = {}
  for (const section of sections) {
    if (section.heading.toLowerCase().includes('launch count')) Object.assign(merged, parseLaunchCounts(section))
    if (section.heading.toLowerCase().includes('booster reuse')) Object.assign(merged, parseBoosterReuse(section))
    if (section.heading.toLowerCase().includes('launches per year')) Object.assign(merged, parseLaunchesPerYear(section))
    if (section.heading.toLowerCase().includes('turnaround')) Object.assign(merged, parseTurnarounds(section))
    if (section.heading.toLowerCase().includes('launch site')) Object.assign(merged, parseLaunchSites(section))
    if (section.heading.toLowerCase().includes('capsule reuse')) Object.assign(merged, parseCapsuleReuse(section))
    if (section.heading.toLowerCase().includes('dragon')) Object.assign(merged, parseDragon(section))
    if (section.heading.toLowerCase().includes('payload')) Object.assign(merged, parseStarlink(section))
  }
  // Starlink count might appear under Payloads
  if (!merged.starlinkSatsInOrbit) {
    for (const section of sections) {
      if (section.heading.toLowerCase().includes('payload')) {
        Object.assign(merged, parseStarlink(section))
      }
    }
  }
  return merged
}

async function fetchSpacexnowStats(fetchImpl: typeof fetch): Promise<ParsedStats> {
  const response = await fetchImpl(SPACEXNOW_STATS_URL, {
    headers: { accept: 'text/html,application/xhtml+xml' },
  })
  if (!response.ok) {
    throw new UpstreamError(
      `spacexnow.com returned ${response.status}`,
      502,
      'UPSTREAM_RESPONSE_ERROR',
      response.status,
    )
  }
  const html = await response.text()
  if (!html || html.length < 500) {
    throw new UpstreamError('spacexnow.com returned an empty response', 502, 'UPSTREAM_INVALID_JSON')
  }
  return parseStatsFromHtml(html)
}

// ---------------------------------------------------------------------------
// GraphQL prevalence fix: ensure the file exports only types and functions
// the server imports.
// ---------------------------------------------------------------------------

export async function fetchLiveStats(fetchImpl: typeof fetch): Promise<StatsSnapshot> {
  const live = await fetchSpacexnowStats(fetchImpl)

  // Merge live data with fallback defaults for any fields the scraper misses.
  const base = { ...STATS_FALLBACK_SNAPSHOT, source: 'spacexnow' as const, stale: false }
  const merged: StatsSnapshot = {
    ...base,
    fetchedAt: new Date().toISOString(),
    totalLaunches: live.totalLaunches ?? base.totalLaunches,
    totalLaunchesSuccessRate: live.totalSuccessRate ?? base.totalLaunchesSuccessRate,
    falcon9Launches: live.falcon9Launches ?? base.falcon9Launches,
    falcon9SuccessRate: live.falcon9SuccessRate ?? base.falcon9SuccessRate,
    falconHeavyLaunches: live.falconHeavyLaunches ?? base.falconHeavyLaunches,
    falconHeavySuccessRate: live.falconHeavySuccessRate ?? base.falconHeavySuccessRate,
    starshipLaunches: live.starshipLaunches ?? base.starshipLaunches,
    starshipSuccessRate: live.starshipSuccessRate ?? base.starshipSuccessRate,
    boosterReflights: live.boosterReflights ?? base.boosterReflights,
    boosterLandingSuccessRate: live.boosterLandingSuccessRate ?? base.boosterLandingSuccessRate,
    maxBoosterFlights: live.maxBoosterFlights ?? base.maxBoosterFlights,
    starlinkSatsInOrbit: live.starlinkSatsInOrbit ?? base.starlinkSatsInOrbit,
    launchesThisYear: live.launchesThisYear ?? base.launchesThisYear,
    launchesThisYearGoal: live.launchesThisYearGoal ?? base.launchesThisYearGoal,
    fastestTurnaroundMinutes: live.fastestTurnaroundMinutes ?? base.fastestTurnaroundMinutes,
    fastestBoosterTurnaroundDays: live.fastestBoosterTurnaroundDays ?? base.fastestBoosterTurnaroundDays,
    busiestLaunchSiteName: live.busiestLaunchSiteName ?? base.busiestLaunchSiteName,
    busiestLaunchSiteLaunches: live.busiestLaunchSiteLaunches ?? base.busiestLaunchSiteLaunches,
    capsuleReflights: live.capsuleReflights ?? base.capsuleReflights,
    capsuleLandingSuccessRate: live.capsuleLandingSuccessRate ?? base.capsuleLandingSuccessRate,
    crewFlownTotal: live.crewFlownTotal ?? base.crewFlownTotal,
    dragonCargoMassUpKg: live.dragonCargoMassUp ?? base.dragonCargoMassUpKg,
    dragonCargoMassDownKg: live.dragonCargoMassDown ?? base.dragonCargoMassDownKg,
  }
  return merged
}

export function isParseError(error: unknown): error is ZodError {
  return error instanceof ZodError
}
