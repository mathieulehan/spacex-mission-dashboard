import { act, renderHook } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REDUCED_MOTION_QUERY, useReducedMotion } from './useReducedMotion'

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const query = {
    matches: initial,
    media: REDUCED_MOTION_QUERY,
    onchange: null,
    addEventListener: vi.fn((_: string, cb: (event: MediaQueryListEvent) => void) => listeners.add(cb)),
    removeEventListener: vi.fn((_: string, cb: (event: MediaQueryListEvent) => void) => listeners.delete(cb)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(query))
  return {
    query,
    set(matches: boolean) {
      query.matches = matches
      listeners.forEach(cb => cb({ matches } as MediaQueryListEvent))
    },
  }
}

describe('useReducedMotion — mouvement réduit côté JS', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lit la préférence au premier rendu', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY)
  })

  it('réagit aux changements de préférence sans recharger la page', () => {
    const media = mockMatchMedia(false)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)

    act(() => media.set(true))
    expect(result.current).toBe(true)
    act(() => media.set(false))
    expect(result.current).toBe(false)
  })

  it('ne casse pas les environnements sans matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('désactive la boucle rAF du globe quand le mouvement est réduit', () => {
    const globe = readFileSync(resolve(process.cwd(), 'src/EarthGlobe.tsx'), 'utf8')
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

    // CSS : décoration. JS : l'auto-rotation doit être conditionnée.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(globe).toMatch(/if \(reducedMotion\) renderFrame\(false\)/)
    expect(globe).toMatch(/else frame = requestAnimationFrame\(animate\)/)
    expect(globe).toContain('useReducedMotion')
  })
})
