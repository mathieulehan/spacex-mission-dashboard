import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatsDashboard } from './StatsDashboard'
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

describe('StatsDashboard ↔ payload réel de /api/stats', () => {
  beforeEach(() => {
    payload = rawStats
    // Une seule frame déjà terminée : valeurs finales déterministes en jsdom.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(performance.now() + 5000)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('fetch', mockFetch())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('affiche les 4 compteurs et les taux avec leurs décimales', async () => {
    renderDashboard()

    expect(await screen.findByText('98.34%')).toBeInTheDocument()
    const text = statsText()
    expect(text).toContain('721') // Lancements totaux
    expect(text).toContain('709 sur 721 missions')
    expect(text).toContain('338') // Réussites consécutives
    expect(text).toContain('111') // Lancements cette année
    expect(text).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('affiche le compte et le taux des sites, et les cartes boosters sans champ vide', async () => {
    renderDashboard()

    expect(await screen.findByText(/LZ1/)).toBeInTheDocument()
    const text = statsText()
    expect(text).toContain('53 (98.15%)')
    expect(text).toContain('663/686 tentatives')
    expect(text).toContain('96.65')
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

    expect(
      (await screen.findAllByText(/Contrat \/api\/stats invalide/, {}, { timeout: 4000 })).length,
    ).toBeGreaterThan(0)
    // État d'erreur explicite : aucun compteur n'est rendu (donc pas de NaN).
    expect(document.querySelectorAll('.stat-card').length).toBe(0)
  })
})
