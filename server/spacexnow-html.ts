/**
 * Parseur HTML minimal pour https://spacexnow.com/stats.
 *
 * `DOMParser` n'existe pas dans Node (v24 comme v26) : on ne peut pas appeler
 * jsdom côté serveur (devDependency). La page est suffisamment régulière
 * (un `<h3>` de titre suivi d'un `<table>` de trois colonnes) pour être lue
 * avec une poignée de regex ciblées, sans dépendance runtime.
 *
 * Toutes les fonctions sont pures : le fixture HTML réel peut être rejoué
 * dans un test sans réseau.
 */

export type StatsRow = { label: string; value: string; extra?: string }
export type StatsSection = { heading: string; rows: StatsRow[] }
export type Fraction = { success: number; total: number; rate: number }

const HTML_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

/** Retire les balises, décode les entités et normalise les espaces. */
export function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, name: string) => {
      if (name.startsWith('#')) {
        const isHex = name[1]?.toLowerCase() === 'x'
        const code = Number.parseInt(name.slice(isHex ? 2 : 1), isHex ? 16 : 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      }
      return HTML_ENTITIES[name.toLowerCase()] ?? match
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Nombre tolérant aux milliers et aux décimales :
 *   "11,190"  -> 11190   (virgule de milliers)
 *   "1,234.56" -> 1234.56
 *   "98.38%"  -> 98.38
 *   "98,38"   -> 98.38   (virgule décimale)
 */
export function parseNumber(value: string): number {
  const cleaned = value.replace(/[^\d.,-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0
  const hasThousandsSeparator = /,\d{3}(?:\D|$)/.test(cleaned)
  const normalized = hasThousandsSeparator
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** "728/740 (98.38%)" -> { success: 728, total: 740, rate: 98.38 }. */
export function parseFraction(value: string): Fraction | null {
  const match = value.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)/)
  if (!match) return null
  const success = parseNumber(match[1])
  const total = parseNumber(match[2])
  const rateMatch = value.match(/\(\s*([\d.,]+)\s*%/)
  const rate = rateMatch ? parseNumber(rateMatch[1]) : total > 0 ? round2((success / total) * 100) : 0
  return { success, total, rate }
}

/** "37 (B1067)" -> { count: 37, label: 'B1067' }. */
export function parseCountAndLabel(value: string): { count: number; label: string } | null {
  const match = value.match(/(\d[\d,]*)\s*\(([^)]+)\)/)
  if (!match) return null
  return { count: parseNumber(match[1]), label: stripHtml(match[2]) }
}

/**
 * Découpe la page en sections repérées par leur titre `<h3>`. Le titre — et
 * jamais la position de la table — est la clé de lecture : l'ordre des
 * sections peut changer sans casser l'extraction.
 */
export function parseStatsSections(html: string): StatsSection[] {
  const headings = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)]
  return headings.map((heading, index) => {
    const bodyStart = (heading.index ?? 0) + heading[0].length
    const bodyEnd = index + 1 < headings.length ? headings[index + 1].index ?? html.length : html.length
    const body = html.slice(bodyStart, bodyEnd)
    const table = body.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)
    const rows: StatsRow[] = []
    if (table) {
      for (const tr of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
          stripHtml(cell[1]),
        )
        if (cells.length < 2) continue
        rows.push({
          label: cells[0],
          value: cells[1],
          ...(cells[2] ? { extra: cells[2] } : {}),
        })
      }
    }
    return { heading: stripHtml(heading[1]), rows }
  })
}

export function findSection(
  sections: StatsSection[],
  heading: string,
): StatsSection | undefined {
  const target = heading.trim().toLowerCase()
  return sections.find((section) => section.heading.trim().toLowerCase() === target)
}

export function findRow(section: StatsSection | undefined, label: string): StatsRow | undefined {
  if (!section) return undefined
  const target = label.trim().toLowerCase()
  return section.rows.find((row) => row.label.trim().toLowerCase() === target)
}
