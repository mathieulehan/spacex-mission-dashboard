import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MobileNav from './MobileNav'

const ITEMS = [
  { id: 'manifest', label: 'Manifest' },
  { id: 'events', label: 'Événements' },
  { id: 'starlink', label: 'Starlink' },
  { id: 'data-status', label: 'État des données' },
]

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  callback: IntersectionObserverCallback
  observed: Element[] = []
  disconnect = vi.fn()

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }

  observe(element: Element) {
    this.observed.push(element)
  }

  unobserve() {}

  emit(target: Element) {
    const entry = {
      target,
      isIntersecting: true,
      boundingClientRect: { top: 10, bottom: 90 },
    } as IntersectionObserverEntry
    this.callback([entry], this as unknown as IntersectionObserver)
  }
}

function renderNav() {
  return render(
    <>
      {ITEMS.map((item) => <section id={item.id} key={item.id} />)}
      <MobileNav />
    </>,
  )
}

function navLinks() {
  return within(screen.getByRole('navigation', { name: 'Navigation principale' })).getAllByRole('link')
}

describe('MobileNav', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    window.location.hash = ''
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders four labelled, linked sections with decorative icons', () => {
    renderNav()

    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
    const links = navLinks()
    expect(links).toHaveLength(4)
    ITEMS.forEach((item, index) => {
      expect(links[index]).toHaveAttribute('href', `#${item.id}`)
      expect(links[index]).toHaveTextContent(item.label)
      expect(links[index].querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    })
    expect(links[0]).toHaveAttribute('aria-current', 'page')
    expect(links.filter((link) => link.hasAttribute('aria-current'))).toHaveLength(1)
  })

  it('starts on the section named in the URL hash', () => {
    window.location.hash = '#starlink'
    renderNav()

    expect(navLinks()[2]).toHaveAttribute('aria-current', 'page')
  })

  it('highlights the section observed by the scroll spy', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as unknown as typeof IntersectionObserver)
    renderNav()

    const observer = FakeIntersectionObserver.instances[0]
    expect(observer.observed.map((section) => section.id)).toEqual(ITEMS.map((item) => item.id))

    act(() => observer.emit(document.getElementById('events')!))

    const links = navLinks()
    expect(links[1]).toHaveAttribute('aria-current', 'page')
    expect(links[0]).not.toHaveAttribute('aria-current')
  })

  it('keeps working without IntersectionObserver and moves focus on activation', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    renderNav()

    const links = navLinks()
    fireEvent.click(links[2])

    expect(links[2]).toHaveAttribute('aria-current', 'page')
    expect(document.activeElement).toBe(document.getElementById('starlink'))
    expect(document.getElementById('starlink')).toHaveAttribute('tabindex', '-1')
  })

  it('parcours clavier : Tab/Shift+Tab sans piège, Entrée déplace le focus', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('IntersectionObserver', undefined)
    renderNav()

    const links = navLinks()
    for (const link of links) {
      await user.tab()
      expect(document.activeElement).toBe(link)
    }
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(links[2])

    links[3].focus()
    await user.keyboard('{Enter}')
    expect(links[3]).toHaveAttribute('aria-current', 'page')
    expect(document.activeElement).toBe(document.getElementById('data-status'))
  })

  it('is hidden on desktop and reserves safe-area and touch-target space on mobile', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    const start = css.indexOf('@media (max-width: 950px)')
    const mobileBlock = css.slice(start, css.indexOf('\n}', start) + 2)

    expect(css).toMatch(/@media \(min-width: 951px\)\s*\{\s*\.mobile-nav \{ display: none; \}/)
    expect(mobileBlock).toContain('.header nav { display: none; }')
    expect(mobileBlock).toContain('.mobile-nav { display: block; }')
    expect(mobileBlock).toContain('env(safe-area-inset-bottom, 0px)')
    expect(mobileBlock).toContain('padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px))')
    expect(css).toMatch(/\.mobile-nav__link \{[^}]*min-width: 44px/s)
    expect(css).toMatch(/\.mobile-nav__link \{[^}]*min-height: 56px/s)
  })
})
