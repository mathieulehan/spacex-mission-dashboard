import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatsDashboard } from './StatsDashboard'
import { BoostersSection } from './BoostersSection'
import rawStats from './test/fixtures/stats-api.json'

let payload: unknown = rawStats

function mockFetch() {
  return vi.fn().mockImplementation(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
  }))
}

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <StatsDashboard />
    </QueryClientProvider>,
  )
}

function statsText() {
  return document.getElementById('stats')?.textContent ?? ''
}

/** Valeurs définitives attendues pour la fixture (ordre des 4 cartes). */
const EXPECTED_VALUES = ['721', '98,34%', '338', '111']

/** Contraste WCAG entre deux couleurs hexadécimales (pour le focus visible). */
function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/../g)!.map(h => {
      const c = parseInt(h, 16) / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('StatsDashboard ↔ payload réel de /api/stats', () => {
  beforeEach(() => {
    payload = rawStats
    vi.stubGlobal('fetch', mockFetch())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('affiche les 4 compteurs et les taux avec leurs décimales', async () => {
    renderDashboard()

    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    const text = statsText()
    expect(text).toContain('721') // Lancements totaux
    expect(text).toContain('709 sur 721 missions')
    expect(text).toContain('338') // Réussites consécutives
    expect(text).toContain('111') // Lancements cette année
    expect(text).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('affiche le compte et le taux des sites, et les cartes boosters sans champ vide', async () => {
    renderDashboard()

    expect((await screen.findAllByText(/LZ1/)).length).toBeGreaterThan(0)
    const text = statsText()
    expect(text).toContain('53 (98,15%)')
    expect(text).toContain('663/686 tentatives')
    expect(text).toContain('96,65')
    expect(text).toContain('37 vols · B1067')
    expect(text).not.toContain('Boosters actifs')
    expect(text).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('annonce le snapshot de secours et ne cite pas The Space Devs', async () => {
    renderDashboard()

    expect(await screen.findByText(/Instantané de secours du 20\/09\/2026/)).toBeInTheDocument()
    expect(statsText()).not.toContain('The Space Devs')
  })

  it('montre une erreur explicite plutôt que NaN si le contrat change', async () => {
    const broken = structuredClone(rawStats) as unknown as {
      launchCadence: Record<string, unknown>
    }
    delete broken.launchCadence.currentSuccessive
    payload = broken

    renderDashboard()

    // Message court en français : le détail technique n'est pas exposé.
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 })
    expect(alert).toHaveTextContent('Impossible de charger les statistiques')
    expect(alert).not.toHaveTextContent(/API unavailable|Contrat \/api\/stats invalide/)
    // État d'erreur explicite : aucun compteur n'est rendu (donc pas de NaN).
    expect(document.querySelectorAll('.stat-card').length).toBe(0)
    expect(statsText()).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('a des règles CSS pour les classes réellement rendues par le composant', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    for (const selector of [
      '.stats-counters', '.stats-charts', '.stats-boosters',
      '.stat-chart-panel', '.stat-chart svg', '.stat-card__sub',
      '.stat-boosters__card', '.stat-boosters__label', '.stat-boosters__value',
    ]) {
      expect(css, `règle CSS manquante pour ${selector}`).toContain(selector)
    }
    expect(css).toMatch(/\.stats-counters \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
    expect(css).toMatch(/\.stat-card__value \{[^}]*font-variant-numeric: tabular-nums/)
  })
})

describe('StatsDashboard — compteurs factuels, sans valeurs intermédiaires', () => {
  beforeEach(() => {
    payload = rawStats
    vi.stubGlobal('fetch', mockFetch())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('rend la valeur définitive dès le premier rendu et n’anime aucun chiffre', async () => {
    const raf = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    renderDashboard()

    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    // Aucune frame d'animation : les chiffres ne « montent » jamais.
    expect(raf).not.toHaveBeenCalled()
    expect([...document.querySelectorAll('.stat-card__value')].map(v => v.textContent))
      .toEqual(EXPECTED_VALUES)
  })

  it('expose chaque valeur définitive comme région live annoncée une seule fois', async () => {
    renderDashboard()

    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    const values = document.querySelectorAll('.stat-card__value')
    expect(values).toHaveLength(4)
    values.forEach(value => {
      expect(value).toHaveAttribute('aria-live', 'polite')
      expect(value).toHaveAttribute('aria-atomic', 'true')
    })
    // Le contenu de la région live est la valeur finale, sans état transitoire.
    expect([...values].map(v => v.textContent)).toEqual(EXPECTED_VALUES)
  })

  it('relie chaque valeur définitive à son sous-label par un id unique', async () => {
    renderDashboard()

    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    const cards = [...document.querySelectorAll('.stat-card')]
    expect(cards).toHaveLength(4)
    const ids = cards.map(card => {
      const value = card.querySelector('.stat-card__value')!
      const sublabel = card.querySelector('.stat-card__sub')!
      const describedBy = value.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      expect(sublabel.id).toBe(describedBy)
      expect(sublabel.textContent).toBeTruthy()
      return sublabel.id
    })
    // Aucune collision : deux cartes ne peuvent pas partager la même description.
    expect(new Set(ids).size).toBe(4)
  })

  it('garde valeur et sous-label cohérents dès le premier rendu', async () => {
    renderDashboard()

    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    // 709 / 721 = 98,34 % : le sous-label et le taux sont issus du même payload.
    expect(statsText()).toContain('709 sur 721 missions')
    expect(statsText()).not.toContain('58,')
    expect(statsText()).not.toContain('437')
    expect(statsText()).not.toContain(' 0,00%')
  })

  it('affiche la valeur finale immédiatement sous prefers-reduced-motion: reduce', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))

    renderDashboard()

    // Aucune animation à désactiver : la valeur cible est déjà dans le DOM.
    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    expect([...document.querySelectorAll('.stat-card__value')].map(v => v.textContent))
      .toEqual(EXPECTED_VALUES)
  })

  it('réseau 3G : aucun « 0 » affiché comme donnée pendant le chargement', async () => {
    let resolveFetch!: () => void
    const gate = new Promise<void>(resolve => { resolveFetch = resolve })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      await gate
      return { ok: true, status: 200, statusText: 'OK', json: async () => rawStats }
    }))

    renderDashboard()

    // Pendant la requête : squelette de chargement, aucun compteur, aucun 0.
    expect(document.querySelectorAll('.loading-card').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('.stat-card').length).toBe(0)
    expect(document.querySelectorAll('.stat-card__value').length).toBe(0)
    expect(statsText()).toContain('Chargement des statistiques…')
    expect(statsText()).not.toMatch(/0[,.]\d+\s*%/)

    resolveFetch()
    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    expect([...document.querySelectorAll('.stat-card__value')].map(v => v.textContent))
      .toEqual(EXPECTED_VALUES)
  })
})

/** Aucune valeur non finie ne doit atteindre le DOM, y compris dans les attributs SVG. */
function expectNoInvalidNumbers() {
  const html = document.body.innerHTML
  expect(html.includes('NaN') || html.includes('Infinity')).toBe(false)
  document.querySelectorAll('svg *').forEach(element => {
    for (const attribute of element.attributes) {
      expect(attribute.value.includes('NaN') || attribute.value.includes('Infinity')).toBe(false)
    }
  })
}

describe('StatsDashboard — graphiques responsive', () => {
  beforeEach(() => {
    payload = rawStats
    vi.stubGlobal('fetch', mockFetch())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('borne la hauteur SVG en CSS et dessine des libellés en pixels fixes', async () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    expect(css.includes('.stat-chart svg {')).toBe(true)
    expect(css.includes('height: 220px')).toBe(true)
    const mobile = css.slice(css.indexOf('@media (max-width: 650px)'))
    expect(mobile.includes('.stat-chart svg, .stat-chart__empty { height: 180px; }')).toBe(true)

    renderDashboard()
    expect(await screen.findByText('98,34%')).toBeInTheDocument()

    const svgs = document.querySelectorAll('.stat-chart svg')
    expect(svgs).toHaveLength(2)
    svgs.forEach(svg => {
      expect(svg).toHaveAttribute('role', 'img')
      expect(svg.getAttribute('aria-label')).toBeTruthy()
      expect(svg.querySelector('title')?.textContent).toBeTruthy()
      const box = (svg.getAttribute('viewBox') || '').split(' ')
      expect(box).toHaveLength(4)
      box.forEach(part => expect(Number.isFinite(Number(part))).toBe(true))
      svg.querySelectorAll('text').forEach(text => {
        expect(text).toHaveAttribute('font-size', '11')
      })
    })
    // Graduations de l'axe Y : valeurs réelles, formatées en fr-FR.
    const labels = [...svgs[0].querySelectorAll('text')].map(t => t.textContent)
    expect(labels).toContain('0')
    expect(labels).toContain('167')
    expectNoInvalidNumbers()
  })

  it('donne aux graphiques un nom court et garde le détail dans <desc>', async () => {
    renderDashboard()
    expect(await screen.findByText('98,34%')).toBeInTheDocument()

    const svgs = [...document.querySelectorAll('.stat-chart svg')] as SVGSVGElement[]
    expect(svgs).toHaveLength(2)
    const [launches, sites] = svgs
    expect(launches.getAttribute('aria-label')).toMatch(/^Lancements par année de \d{4} à \d{4}$/)
    expect(sites.getAttribute('aria-label')).toMatch(/^Sites d'atterrissage · \d+ sites$/)
    // Faute de frappe historique (« atterissages ») supprimée du libellé visible.
    expect(document.body.textContent).not.toContain('atterissages')

    svgs.forEach(svg => {
      const name = svg.getAttribute('aria-label')!
      expect(name.length).toBeLessThan(60)
      const descId = svg.getAttribute('aria-describedby')!
      expect(descId).toBeTruthy()
      const desc = document.getElementById(descId)!
      expect(desc.tagName.toLowerCase()).toBe('desc')
      expect(desc.textContent!.length).toBeGreaterThan(name.length)
      expect(svg.querySelector('title')?.textContent).toBeTruthy()
    })
    expectNoInvalidNumbers()
  })

  it('affiche un état vide explicite, sans NaN ni Infinity dans le DOM', async () => {
    const empty = structuredClone(rawStats) as unknown as {
      launchCadence: { launchesPerYear: unknown[] }
      landingSites: unknown[]
    }
    empty.launchCadence.launchesPerYear = []
    empty.landingSites = []
    payload = empty

    renderDashboard()
    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    expect(screen.getByText('Aucun lancement par année disponible')).toBeInTheDocument()
    expect(screen.getByText("Aucun site d'atterrissage disponible")).toBeInTheDocument()
    expect(document.querySelectorAll('.stat-chart svg').length).toBe(0)
    expectNoInvalidNumbers()
  })

  it('gère une seule année et des valeurs nulles sans division par zéro', async () => {
    const one = structuredClone(rawStats) as unknown as {
      launchCadence: { launchesPerYear: unknown[] }
      landingSites: unknown[]
    }
    one.launchCadence.launchesPerYear = [{ year: 2026, planned: 0, completed: 0, rate: 0 }]
    one.landingSites = [{ site: 'LZ1', landed: 0, attempts: 0, rate: 0 }]
    payload = one

    renderDashboard()
    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    expect(document.querySelector('.stat-chart svg rect')).toHaveAttribute('height', '0')
    expectNoInvalidNumbers()
  })
})

/** Requête bloquée : on garde la main sur la résolution pour tester le loading. */
function gatedFetch() {
  let resolve!: () => void
  const gate = new Promise<void>(r => { resolve = r })
  const fetchMock = vi.fn().mockImplementation(async () => {
    await gate
    return { ok: true, status: 200, statusText: 'OK', json: async () => rawStats }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, resolve }
}

describe('StatsDashboard — états loading / erreur / vide', () => {
  beforeEach(() => { payload = rawStats })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('loading : 4 cartes + 2 panneaux sur la grille, annoncés aux lecteurs d’écran', async () => {
    const { resolve } = gatedFetch()

    renderDashboard()

    expect(document.querySelector('#stats')).toHaveAttribute('aria-busy', 'true')
    // Le squelette est dans les MÊMES conteneurs que le contenu définitif.
    expect(document.querySelectorAll('.stats-counters .loading-card--kpi')).toHaveLength(4)
    expect(document.querySelectorAll('.stats-charts .loading-card--panel')).toHaveLength(2)
    // Plus d'ancien `.loading-grid` de 2 cartes laissant un trou de 600 px.
    expect(document.querySelector('#stats .loading-grid')).toBeNull()
    expect(document.querySelectorAll('.stat-card').length).toBe(0)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Chargement des statistiques…')

    resolve()
    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    expect(document.querySelector('#stats')).not.toHaveAttribute('aria-busy', 'true')
  })

  it('erreur : message FR, bouton Réessayer fonctionnel et focus visible', async () => {
    let attempt = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      attempt += 1
      // La requête échoue deux fois (retry:1) avant que l'utilisateur ne
      // clique sur « Réessayer » : là seulement elle doit réussir.
      if (attempt <= 2) throw new Error('API unavailable: ECONNRESET')
      return { ok: true, status: 200, statusText: 'OK', json: async () => rawStats }
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard()

    const alert = await screen.findByRole('alert', {}, { timeout: 4000 })
    expect(alert).toHaveTextContent('Impossible de charger les statistiques')
    // Aucun message technique ni anglais exposé à l'utilisateur final.
    expect(statsText()).not.toContain('API unavailable')
    expect(statsText()).not.toContain('ECONNRESET')
    expect(document.querySelectorAll('.stat-card').length).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    expect(css).toMatch(/\.error-state button:focus-visible/)
    expect(css).toMatch(/\.stats-fallback-notice button:focus-visible/)
  })

  it('erreur : les actions sont focusables et activables au clavier', async () => {
    const user = userEvent.setup()
    let attempt = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      attempt += 1
      if (attempt <= 2) throw new Error('API unavailable: ECONNRESET')
      return { ok: true, status: 200, statusText: 'OK', json: async () => rawStats }
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard()
    await screen.findByRole('alert', {}, { timeout: 4000 })

    const retry = screen.getByRole('button', { name: 'Réessayer' })
    const fallback = screen.getByRole('button', { name: /Voir le dernier instantané connu/ })
    expect(retry).not.toHaveAttribute('tabindex')
    expect(fallback).not.toHaveAttribute('tabindex')

    retry.focus()
    await user.tab()
    expect(document.activeElement).toBe(fallback)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(retry)
    await user.keyboard('{Enter}')
    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('garde des cibles tactiles ≥ 44 px et un focus visible contrasté', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    expect(css).toMatch(/\.error-state button \{[^}]*min-height: 44px/s)
    expect(css).toMatch(/\.stats-fallback-notice button \{[^}]*min-height: 44px/s)
    expect(css).toMatch(/:focus-visible \{ outline: 2px solid var\(--blue\)/)

    const focusColor = css.match(/--blue:\s*(#[0-9a-f]{6})/i)?.[1]
    const background = css.match(/background:\s*(#[0-9a-f]{6})/i)?.[1]
    expect(focusColor).toBeTruthy()
    expect(background).toBeTruthy()
    expect(contrastRatio(focusColor!, background!)).toBeGreaterThanOrEqual(3)
  })

  it('erreur : propose le dernier instantané connu, clairement daté', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API unavailable: ECONNRESET')))

    renderDashboard()
    await screen.findByRole('alert', {}, { timeout: 4000 })

    fireEvent.click(screen.getByRole('button', { name: /Voir le dernier instantané connu/ }))

    expect(document.querySelectorAll('.stat-card')).toHaveLength(4)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getAllByText(/Instantané de secours du 20\/09\/2026/).length).toBeGreaterThan(0)
    expect(screen.getByText(/momentanément indisponibles/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })

  it('vide : états explicites pour les graphiques, sans NaN', async () => {
    const empty = structuredClone(rawStats) as unknown as {
      launchCadence: { launchesPerYear: unknown[] }
      landingSites: unknown[]
    }
    empty.launchCadence.launchesPerYear = []
    empty.landingSites = []
    payload = empty
    vi.stubGlobal('fetch', mockFetch())

    renderDashboard()
    expect(await screen.findByText('98,34%')).toBeInTheDocument()
    expect(screen.getByText('Aucun lancement par année disponible')).toBeInTheDocument()
    expect(screen.getByText("Aucun site d'atterrissage disponible")).toBeInTheDocument()
    expect(document.querySelectorAll('.stat-chart svg').length).toBe(0)
    expect(statsText()).not.toMatch(/NaN|Infinity/)
  })

  it('aucune section voisine n’affiche « aucune donnée » pendant le chargement', async () => {
    const { resolve } = gatedFetch()

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StatsDashboard />
        <BoostersSection />
      </QueryClientProvider>,
    )

    expect(screen.queryByText('Aucune donnée de booster disponible.')).toBeNull()
    // Les deux sections partagent le même snapshot : même état d'attente.
    expect(document.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThanOrEqual(2)

    resolve()
    expect(await screen.findByText('98,34%')).toBeInTheDocument()
  })
})

describe('StatsDashboard — timeout du chargement', () => {
  beforeEach(() => {
    payload = rawStats
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('affiche le snapshot daté après 9 s plutôt qu’un loading infini', async () => {
    const { resolve } = gatedFetch()

    renderDashboard()
    expect(document.querySelector('#stats')).toHaveAttribute('aria-busy', 'true')
    expect(document.querySelectorAll('.loading-card').length).toBeGreaterThan(0)

    act(() => { vi.advanceTimersByTime(9_000) })

    expect(document.querySelector('#stats')).not.toHaveAttribute('aria-busy', 'true')
    expect(document.querySelectorAll('.loading-card').length).toBe(0)
    expect(document.querySelectorAll('.stat-card')).toHaveLength(4)
    expect(screen.getByText(/Le chargement des données en direct a dépassé le délai imparti/))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    expect(screen.getAllByText(/Instantané de secours du 20\/09\/2026/).length).toBeGreaterThan(0)
    expect(statsText()).not.toMatch(/NaN|Infinity/)
    resolve()
  })
})
