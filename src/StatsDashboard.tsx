import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SectionHeading, Loading, ErrorState } from './components'
import { missionApi } from './api'
import { formatDate, formatNumber } from './utils'
import type { Stats } from './types'

const POLL_INTERVAL_MS = 10 * 60 * 1_000 // 10 minutes – matches spacexnow.com update cadence

function StatsCard({
  label,
  value,
  unit,
  suffix,
  tone,
}: {
  label: string
  value: string | number
  unit?: string
  suffix?: React.ReactNode
  tone?: 'go' | 'warning' | 'neutral'
}) {
  return (
    <div className={`stat-card stat-card--${tone ?? 'neutral'}`}>
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value">
        <span className="stat-card__number">
          {typeof value === 'number' ? formatNumber(value, 0) : value}
        </span>
        {unit ? <span className="stat-card__unit">{unit}</span> : null}
        {suffix ? <span className="stat-card__suffix">{suffix}</span> : null}
      </p>
    </div>
  )
}

function LaunchCadencePanel({ stats }: { stats: Stats }) {
  const { launchCadence } = stats
  const years = launchCadence.launchesPerYear.slice(0, 8)

  return (
    <div className="stats-panel">
      <div className="stats-panel__header">
        <div>
          <p className="eyebrow">Launch cadence</p>
          <h3>How fast SpaceX flies</h3>
        </div>
        <StatsCard
          label="Total launches"
          value={launchCadence.totalLaunches}
          suffix={`/${launchCadence.totalLaunches + launchCadence.failedLaunches}`}
          tone="go"
        />
      </div>

      <div className="stats-row">
        <StatsCard label="Successful" value={launchCadence.successfulLaunches} tone="go" />
        <StatsCard label="Failed" value={launchCadence.failedLaunches} tone="warning" />
        <StatsCard label="Success rate" value={launchCadence.successRate.toFixed(2)} unit="%" tone="go" />
      </div>

      <div className="stats-row">
        <StatsCard
          label="Current streak"
          value={launchCadence.currentSuccessive}
          suffix={<span>consecutive</span>}
          tone="go"
        />
        <StatsCard
          label="Longest streak"
          value={launchCadence.mostSuccessive}
          suffix={<span>consecutive</span>}
          tone="neutral"
        />
        <StatsCard
          label="Most in a year"
          value={launchCadence.mostLaunchesInYear.completed}
          unit="launches"
          suffix={<span>({launchCadence.mostLaunchesInYear.year})</span>}
          tone="go"
        />
      </div>

      <div className="stats-panel__chart">
        <p className="eyebrow">Annual launch record</p>
        <div className="bar-chart">
          {years.map((entry) => {
            const maxCompleted = Math.max(...years.map((y) => y.completed), 1)
            const maxPlanned = Math.max(...years.map((y) => y.planned), 1)
            const pct = Math.round((entry.completed / entry.planned) * 100)
            return (
              <div key={entry.year} className="bar-row">
                <span className="bar-year">{entry.year}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill bar-fill--planned"
                    style={{ width: `${(entry.planned / maxPlanned) * 100}%` }}
                    title={`Planned: ${entry.planned}`}
                  />
                  <div
                    className="bar-fill bar-fill--completed"
                    style={{ width: `${(entry.completed / maxPlanned) * 100}%` }}
                    title={`Completed: ${entry.completed} (${pct}%)`}
                  />
                </div>
                <span className="bar-label">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="stats-panel__goal">
        <p className="eyebrow">2026 launch goal</p>
        <div className="goal-row">
          <span>{formatNumber(launchCadence.launchGoal2026.completed, 0)}</span>
          <span className="goal-separator">/</span>
          <span>{formatNumber(launchCadence.launchGoal2026.planned, 0)}</span>
          <span className="goal-rate">{launchCadence.launchGoal2026.rate.toFixed(1)}%</span>
        </div>
        <div className="goal-bar">
          <div
            className="goal-bar__fill"
            style={{
              width: `${Math.min(100, launchCadence.launchGoal2026.rate)}%`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

function BoosterPanel({ stats }: { stats: Stats }) {
  const { boosters } = stats

  return (
    <div className="stats-panel">
      <div className="stats-panel__header">
        <div>
          <p className="eyebrow">Booster reuse</p>
          <h3>Landing & turnaround records</h3>
        </div>
        <StatsCard
          label="Landing rate"
          value={boosters.landingRate.toFixed(2)}
          unit="%"
          tone="go"
        />
      </div>

      <div className="stats-row">
        <StatsCard label="Landed" value={boosters.totalLanded} suffix={<span>/{boosters.totalAttempts}</span>} tone="go" />
        <StatsCard label="Reflown" value={boosters.reflown} tone="neutral" />
        <StatsCard
          label="Most flights"
          value={boosters.mostFlights.flights}
          suffix={`(${boosters.mostFlights.booster})`}
          tone="go"
        />
      </div>

      <div className="stats-panel__block5">
        <p className="eyebrow">Block 5 performance</p>
        <div className="stats-row stats-row--tight">
          <StatsCard label="Landed" value={boosters.block5Landed} suffix={<span>/{boosters.block5Attempts}</span>} tone="go" />
          <StatsCard label="Rate" value={boosters.block5Rate.toFixed(2)} unit="%" tone="go" />
          <StatsCard label="Reflown" value={boosters.block5Reflown} tone="neutral" />
        </div>
      </div>

      <div className="stats-panel__turnarounds">
        <h4>Fastest turnarounds</h4>
        <div className="turnaround-list">
          <div className="turnaround">
            <span className="turnaround__duration">{boosters.fastestTurnaround.duration}</span>
            <span className="turnaround__site">Booster</span>
            <span className="turnaround__detail">{boosters.fastestTurnaround.booster}</span>
          </div>
          <div className="turnaround">
            <span className="turnaround__duration">{boosters.fastestTurnaroundCapeCanaveral.duration}</span>
            <span className="turnaround__site">CCSFS</span>
            <span className="turnaround__detail">{boosters.fastestTurnaroundCapeCanaveral.firstFlight} → {boosters.fastestTurnaroundCapeCanaveral.secondFlight}</span>
          </div>
          <div className="turnaround">
            <span className="turnaround__duration">{boosters.fastestTurnaroundVandenberg.duration}</span>
            <span className="turnaround__site">VSFB</span>
            <span className="turnaround__detail">{boosters.fastestTurnaroundVandenberg.firstFlight} → {boosters.fastestTurnaroundVandenberg.secondFlight}</span>
          </div>
          <div className="turnaround">
            <span className="turnaround__duration">{boosters.fastestTurnaroundStarbase.duration}</span>
            <span className="turnaround__site">Starbase</span>
            <span className="turnaround__detail">{boosters.fastestTurnaroundStarbase.firstFlight} → {boosters.fastestTurnaroundStarbase.secondFlight}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function StarlinkStatPanel({ stats }: { stats: Stats }) {
  const { starlink } = stats

  return (
    <div className="stats-panel stats-panel--alt">
      <div className="stats-panel__header">
        <div>
          <p className="eyebrow">Starlink constellation</p>
          <h3>Satellites in orbit</h3>
        </div>
        <StatsCard
          label="In orbit"
          value={starlink.inOrbit}
          tone="go"
        />
      </div>

      <div className="stats-row">
        <StatsCard label="Total launches" value={starlink.totalLaunches} tone="neutral" />
        <StatsCard label="Starlink flights" value={starlink.starlinkLaunches} tone="go" />
        <StatsCard label="Starlink share" value={starlink.starlinkRate.toFixed(2)} unit="%" tone="neutral" />
      </div>

      <div className="stats-panel__lifts">
        <h4>Heavy-lift records</h4>
        <div className="lift-list">
          <div className="lift">
            <span className="lift__mass">{starlink.heaviestLeoLift.mass}</span>
            <span className="lift__mission">{starlink.heaviestLeoLift.mission}</span>
          </div>
          <div className="lift">
            <span className="lift__mass">{starlink.heaviestGtoLift.mass}</span>
            <span className="lift__mission">{starlink.heaviestGtoLift.mission}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function LandingSitesPanel({ stats }: { stats: Stats }) {
  const sites = [
    { key: 'LZ1', label: 'LZ-1', site: stats.landingSites.LZ1 },
    { key: 'LZ2', label: 'LZ-2', site: stats.landingSites.LZ2 },
    { key: 'LZ4', label: 'LZ-4', site: stats.landingSites.LZ4 },
    { key: 'LZ40', label: 'LZ-40', site: stats.landingSites.LZ40 },
    { key: 'ASOG', label: 'ASOG', site: stats.landingSites.ASOG },
    { key: 'JRTI', label: 'JRTI', site: stats.landingSites.JRTI },
    { key: 'OCISLY', label: 'OCISLY', site: stats.landingSites.OCISLY },
    { key: 'Catch', label: 'Mechazilla', site: stats.landingSites.Catch },
  ]

  return (
    <div className="stats-panel">
      <div className="stats-panel__header">
        <div>
          <p className="eyebrow">Landing sites</p>
          <h3>Recovery performance by location</h3>
        </div>
      </div>
      <div className="site-grid">
        {sites.map(({ key, label, site }) => (
          <div key={key} className="site-card">
            <span className="site-card__name">{label}</span>
            <span className="site-card__rate" style={{ color: site.rate >= 99 ? 'var(--color-go)' : site.rate >= 95 ? 'var(--color-warning)' : 'var(--color-accent-muted)' }}>
              {site.rate.toFixed(1)}%
            </span>
            <span className="site-card__count">{site.landed}/{site.attempts}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DragonsPanel({ stats }: { stats: Stats }) {
  return (
    <div className="stats-panel stats-panel--compact">
      <div className="stats-panel__header">
        <div>
          <p className="eyebrow">Dragon fleet</p>
          <h3>Cargo & crew missions</h3>
        </div>
      </div>
      <div className="stats-row">
        <StatsCard label="Cargo" value={stats.dragons.cargoMissions} tone="neutral" />
        <StatsCard label="Crew" value={stats.dragons.crewMissions} tone="go" />
        <StatsCard label="Test" value={stats.dragons.testMissions} tone="neutral" />
        <StatsCard label="Reflights" value={stats.dragons.reflights} tone="neutral" />
      </div>
      <div className="stats-panel__dragon-detail">
        <p>ISS cargo: <strong>{stats.dragons.issCargoUp} up / {stats.dragons.issCargoDown} down</strong></p>
        <p>Crew flown total: <strong>{stats.dragons.crewFlownTotal}</strong> · Currently in orbit: <strong>{stats.dragons.crewInOrbit}</strong></p>
      </div>
    </div>
  )
}

function CapsulesPanel({ stats }: { stats: Stats }) {
  return (
    <div className="stats-panel stats-panel--compact">
      <div className="stats-panel__header">
        <div>
          <p className="eyebrow">Capsule reuse</p>
          <h3>Crew Dragon recovery</h3>
        </div>
        <StatsCard label="Landing rate" value={stats.capsules.rate.toFixed(2)} unit="%" tone="go" />
      </div>
      <div className="stats-row">
        <StatsCard label="Landed" value={stats.capsules.landed} suffix={<span>/{stats.capsules.attempts}</span>} tone="go" />
        <StatsCard label="Reflown" value={stats.capsules.reflown} tone="neutral" />
      </div>
    </div>
  )
}

function BusinessPanel({ stats }: { stats: Stats }) {
  return (
    <div className="stats-panel stats-panel--alt">
      <div className="stats-panel__header">
        <div>
          <p className="eyebrow">Business metrics</p>
          <h3>Revenue, valuation & growth</h3>
        </div>
      </div>
      <div className="business-grid">
        <div className="business-item">
          <p className="business-item__label">Revenue (2025 est.)</p>
          <p className="business-item__value">{stats.business.revenue2025}</p>
        </div>
        <div className="business-item">
          <p className="business-item__label">Valuation (private)</p>
          <p className="business-item__value">{stats.business.valuation}</p>
        </div>
        <div className="business-item">
          <p className="business-item__label">Employees (est.)</p>
          <p className="business-item__value">{stats.business.employees}</p>
        </div>
        <div className="business-item">
          <p className="business-item__label">Starlink subscribers (est.)</p>
          <p className="business-item__value">{stats.business.starlinkSubscribers}</p>
        </div>
        <div className="business-item">
          <p className="business-item__label">Starlink revenue (2024 est.)</p>
          <p className="business-item__value">{stats.business.starlinkRevenue}</p>
        </div>
      </div>
    </div>
  )
}

function LastUpdated({ fetchedAt }: { fetchedAt: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  const elapsed = Math.floor((now - Date.parse(fetchedAt)) / 1_000)
  const minutes = Math.floor(elapsed / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  let text: string
  if (days > 0) text = `${days}d ago`
  else if (hours > 0) text = `${hours}h ${minutes % 60}m ago`
  else if (minutes > 0) text = `${minutes}m ago`
  else text = 'just now'
  return (
    <span className="last-updated" title={new Date(fetchedAt).toLocaleString()}>
      <i aria-hidden="true" />
      Updated {text}
    </span>
  )
}

export function StatsDashboard() {
  const query = useQuery({
    queryKey: ['stats'],
    queryFn: missionApi.stats,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: 1,
  })

  if (query.isPending) return <Loading count={2} />
  if (query.isError) return <ErrorState message={query.error.message} retry={() => query.refetch()} />

  const stats = query.data

  return (
    <section className="stats-section" id="stats">
      <div className="section-heading">
        <span className="section-index">04</span>
        <div>
          <p className="eyebrow">Live stats</p>
          <h2>SpaceX by the numbers</h2>
          <p>Dynamically retrieved from spacexnow.com — refreshed every 10 minutes. Displayed values are current as of the last successful scrape; fallback data is used when the source is unavailable.</p>
        </div>
      </div>

      <div className="stats-grid">
        <LaunchCadencePanel stats={stats} />
        <BoosterPanel stats={stats} />
        <StarlinkStatPanel stats={stats} />
        <LandingSitesPanel stats={stats} />
        <DragonsPanel stats={stats} />
        <CapsulesPanel stats={stats} />
        <BusinessPanel stats={stats} />
      </div>

      <div className="stats-footer">
        <LastUpdated fetchedAt={stats.fetchedAt} />
        <a
          className="stats-footer__source"
          href="https://spacexnow.com/stats"
          target="_blank"
          rel="noreferrer"
        >
          Source: spacexnow.com/stats <span aria-hidden="true">↗</span>
        </a>
        {stats.stale && (
          <span className="badge badge--warning">Showing cached data</span>
        )}
      </div>
    </section>
  )
}
