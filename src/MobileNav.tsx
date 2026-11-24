import { useEffect, useState, type ComponentType, type MouseEvent } from 'react'

type NavItem = {
  id: string
  label: string
  Icon: ComponentType
}

function ManifestIcon() {
  return (
    <svg
      className="mobile-nav__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  )
}

function EventsIcon() {
  return (
    <svg
      className="mobile-nav__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18M8 14h3M8 17h6" />
    </svg>
  )
}

function StarlinkIcon() {
  return (
    <svg
      className="mobile-nav__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
    </svg>
  )
}

function DataStatusIcon() {
  return (
    <svg
      className="mobile-nav__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="12" cy="5.5" rx="8" ry="2.5" />
      <path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13" />
      <path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" />
    </svg>
  )
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'manifest', label: 'Manifest', Icon: ManifestIcon },
  { id: 'events', label: 'Événements', Icon: EventsIcon },
  { id: 'starlink', label: 'Starlink', Icon: StarlinkIcon },
  { id: 'data-status', label: 'État des données', Icon: DataStatusIcon },
]

function initialSection() {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.slice(1)
    if (NAV_ITEMS.some((item) => item.id === hash)) return hash
  }
  return NAV_ITEMS[0].id
}

/** Move the virtual cursor to the section we just navigated to. */
function focusSection(id: string) {
  const section = document.getElementById(id)
  if (!section) return

  const previousTabIndex = section.getAttribute('tabindex')
  if (previousTabIndex === null) section.setAttribute('tabindex', '-1')
  section.focus({ preventScroll: true })

  const restoreTabIndex = () => {
    if (previousTabIndex === null) section.removeAttribute('tabindex')
    else section.setAttribute('tabindex', previousTabIndex)
    section.removeEventListener('blur', restoreTabIndex)
  }
  section.addEventListener('blur', restoreTabIndex)
}

export default function MobileNav() {
  const [activeId, setActiveId] = useState(initialSection)

  useEffect(() => {
    // jsdom and older browsers have no IntersectionObserver: keep the hash-based default.
    if (typeof IntersectionObserver === 'undefined') return

    const sections = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (section): section is HTMLElement => section !== null,
    )
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length === 0) return
        // The section nearest the top of the viewport wins inside the observation band.
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        setActiveId(visible[0].target.id)
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  const handleClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    setActiveId(id)
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    focusSection(id)
  }

  return (
    <nav className="mobile-nav" role="navigation" aria-label="Navigation mobile">
      <ul className="mobile-nav__list">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <li className="mobile-nav__item" key={id}>
            <a
              className="mobile-nav__link"
              href={`#${id}`}
              aria-current={activeId === id ? 'page' : undefined}
              onClick={(event) => handleClick(event, id)}
            >
              <Icon />
              <span className="mobile-nav__label">{label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
