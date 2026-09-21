import { useEffect, useState, type ReactNode } from 'react'
import { countdown } from './utils'

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'live' | 'go' | 'warning' | 'neutral'
  children: ReactNode
  className?: string
}) {
  return <span className={`badge badge--${tone}${className ? ` ${className}` : ''}`}>{children}</span>
}
export function ExternalLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a className="external-link" href={href} target="_blank" rel="noreferrer">
      {children} <span aria-hidden="true">↗</span>
    </a>
  )
}

export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
}: {
  index: string
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="section-heading">
      <span className="section-index">{index}</span>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  )
}

export function Loading({ count = 3 }: { count?: number }) {
  return (
    <div className="loading-grid" aria-label="Loading telemetry" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="loading-card" key={index}>
          <i />
          <i />
          <i />
        </div>
      ))}
    </div>
  )
}

export function ErrorState({
  message,
  retry,
}: {
  message: string
  retry: () => void
}) {
  return (
    <div className="error-state" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <strong>Data link unavailable</strong>
        <p>{message}</p>
      </div>
      <button type="button" onClick={retry}>
        Retry
      </button>
    </div>
  )
}

export function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  const value = countdown(target, now)
  if (!value) return <p className="elapsed">Launch window reached</p>

  return (
    <div className="countdown" aria-label="Countdown to launch">
      {Object.entries(value).map(([label, amount]) => (
        <div key={label}>
          <strong>{String(amount).padStart(2, '0')}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
