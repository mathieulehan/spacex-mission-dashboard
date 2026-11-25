import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoostersSection } from './BoostersSection'
import rawStats from './test/fixtures/stats-api.json'
import type { Booster } from './types'

const BOOSTER_COUNT = 87

function makeBoosters(): Booster[] {
  return Array.from({ length: BOOSTER_COUNT }, (_, index) => {
    const n = index + 1
    // Les atterrissages ne suivent pas l'ordre des vols : le tri doit être
    // testable indépendamment (39 réussites pour B1017 et B1057).
    const landed = (n * 7) % 40
    return {
      serialNumber: `B10${String(n).padStart(2, '0')}`,
      type: 'Falcon 9 Block 5',
      flights: n,
      landed,
      attempted: Math.max(landed, 1),
      landingRate: 50 + (n % 50),
      status: n % 3 === 0 ? 'retired' : 'active',
      lastFlight: '2026-11-20T12:00:00.000Z',
    }
  })
}

type MutableStatsPayload = { boosters: Record<string, unknown> } & Record<string, unknown>

function renderSection() {
  const payload = structuredClone(rawStats) as unknown as MutableStatsPayload
  payload.boosters.list = makeBoosters()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
  }))

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BoostersSection />
    </QueryClientProvider>,
  )
}

function rows() {
  return document.querySelectorAll('.boosters-table tbody tr')
}

function serialAt(index: number) {
  return rows()[index]?.querySelector('.booster-serial')?.textContent
}

function landedAt(index: number) {
  return rows()[index]?.querySelectorAll('td')[2]?.textContent ?? ''
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('BoostersSection — pagination et mobile', () => {
  it('ne rend que 10 des 87 boosters et annonce « Page 1 / 9 »', async () => {
    renderSection()
    await screen.findByRole('table')

    expect(rows()).toHaveLength(10)
    expect(screen.getByText('Page 1 / 9')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeEnabled()
    // Le tri par défaut (vols décroissants) reste le premier affiché.
    expect(serialAt(0)).toBe('B1087')
  })

  it('navigue avant et arrière, et borne la dernière page (7 lignes)', async () => {
    renderSection()
    await screen.findByRole('table')
    const next = screen.getByRole('button', { name: 'Page suivante' })
    const previous = screen.getByRole('button', { name: 'Page précédente' })

    fireEvent.click(next)
    expect(screen.getByText('Page 2 / 9')).toBeInTheDocument()
    expect(serialAt(0)).toBe('B1077')
    expect(rows()).toHaveLength(10)

    fireEvent.click(previous)
    expect(screen.getByText('Page 1 / 9')).toBeInTheDocument()
    expect(serialAt(0)).toBe('B1087')

    for (let i = 0; i < 8; i += 1) fireEvent.click(next)
    expect(screen.getByText('Page 9 / 9')).toBeInTheDocument()
    expect(rows()).toHaveLength(7)
    expect(next).toBeDisabled()
    expect(previous).toBeEnabled()

    fireEvent.click(next)
    expect(screen.getByText('Page 9 / 9')).toBeInTheDocument()
  })

  it('revient en page 1 quand le tri change, en triant Atterrissages par réussites', async () => {
    renderSection()
    await screen.findByRole('table')
    const next = screen.getByRole('button', { name: 'Page suivante' })
    fireEvent.click(next)
    fireEvent.click(next)
    expect(screen.getByText('Page 3 / 9')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('columnheader', { name: /Atterrissages/ }))
    expect(screen.getByText('Page 1 / 9')).toBeInTheDocument()
    expect(landedAt(0)).toContain('39')
    expect(serialAt(0)).not.toBe('B1087')
    expect(screen.getByRole('columnheader', { name: /Atterrissages/ }))
      .toHaveAttribute('aria-sort', 'descending')

    // Le tri sur les deux autres colonnes reste disponible.
    fireEvent.click(screen.getByRole('columnheader', { name: /^Boosters/ }))
    expect(screen.getByText('Page 1 / 9')).toBeInTheDocument()
    expect(serialAt(0)).toBe('B1087')
    fireEvent.click(screen.getByRole('columnheader', { name: /^Boosters/ }))
    expect(serialAt(0)).toBe('B1001')
    expect(screen.getByRole('columnheader', { name: /^Boosters/ }))
      .toHaveAttribute('aria-sort', 'ascending')
  })

  it('ne rend plus l’en-tête « Taux » ni la colonne associée', async () => {
    renderSection()
    await screen.findByRole('table')

    expect(screen.queryByText('Taux', { exact: true })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Taux' })).toBeNull()
    expect(document.querySelectorAll('.boosters-table thead th')).toHaveLength(5)
    expect(rows()[0].querySelectorAll('td')).toHaveLength(5)
    // Le taux global de la section reste, lui, bien affiché.
    expect(screen.getByText('Taux d\'atterrissage global')).toBeInTheDocument()
  })

  it('fournit un libellé data-label sur chaque cellule pour le mode carte', async () => {
    renderSection()
    await screen.findByRole('table')

    const labels = Array.from(rows()[0].querySelectorAll('td'))
      .map((cell) => cell.getAttribute('data-label'))
    expect(labels).toEqual(['Booster', 'Vols', 'Atterrissages', 'Statut', 'Dernier vol'])
    expect(screen.getByRole('button', { name: 'Page suivante' })).toHaveAttribute('type', 'button')
  })

  it('a les règles CSS mobiles (cartes, libellés, cibles 44px, aucun débordement)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    const mobile = css.slice(css.indexOf('@media (max-width: 640px)'))

    expect(mobile).toContain('min-width: 0;')
    expect(mobile).toContain('overflow: visible;')
    expect(mobile).toContain('display: block;')
    expect(mobile).toContain('content: attr(data-label);')
    expect(mobile).toContain('min-height: 44px;')
    // Les deux dimensions de la cible sont définies sur le bouton lui-même.
    expect(css).toMatch(/\.boosters-page-button\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s)

    // Aucun conteneur à défilement horizontal, aucune largeur minimale mobile.
    expect(css).not.toMatch(/\.boosters-table-wrap\s*\{[^}]*overflow-x:\s*auto/)
    expect(css).not.toMatch(/\.boosters-table\s*\{[^}]*min-width:\s*440px/)
    expect(mobile).not.toContain('min-width: 440px')
  })
})
