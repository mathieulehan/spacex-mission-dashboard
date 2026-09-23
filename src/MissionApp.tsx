import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Countdown, ErrorState, ExternalLink, Loading, SectionHeading } from './components'
import { StatsDashboard } from './StatsDashboard'
import { NextLaunchesSection } from './NextLaunches'
import { missionApi } from './api'
import { launchCalendarHref } from './calendar'
import type { Launch, LaunchDetail, SpaceEvent, StarlinkSummary, Stats } from './types'
import { formatDate, formatNumber, relativeTime, timeUntil } from './utils'
import './styles.css'

const queryDefaults = { retry: 1, refetchOnWindowFocus: false }
const EarthGlobe = lazy(async () => {
  const module = await import('./EarthGlobe')
  return { default: module.EarthGlobe }
})

function statusTone(status: string) {
  const value = status.toLowerCase()
  if (value.includes('hold') || value.includes('fail')) return 'warning' as const
  if (value.includes('go') || value.includes('success')) return 'go' as const
  return 'neutral' as const
}

function DetailButton({
  launch,
  children,
  onSelect,
}: {
  launch: Launch
  children: string
  onSelect: (launch: Launch) => void
}) {
  return (
    <button className="detail-button" type="button" onClick={() => onSelect(launch)}>
      {children} <span aria-hidden="true">→</span>
    </button>
  )
}

function CalendarLink({ launch }: { launch: Launch }) {
  const href = launchCalendarHref(launch)
  if (!href) return null
  const filename = `${(launch.missionName ?? launch.name)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'launch'}.ics`

  return (
    <a
      className="calendar-link"
      href={href}
      download={filename}
      aria-label={`Add ${launch.missionName ?? launch.name} to calendar`}
    >
      Add to calendar <span aria-hidden="true">＋</span>
    </a>
  )
}

function MissionHero({
  launch,
  onSelect,
}: {
  launch: Launch
  onSelect: (launch: Launch) => void
}) {
  return (
    <article className="mission-hero">
      <div className="mission-hero__image">
        {launch.imageUrl ? <img src={launch.imageUrl} alt="" /> : <div />}
        <div className="mission-hero__shade" />
      </div>
      <div className="mission-hero__content">
        <div className="badge-row">
          <Badge tone={statusTone(launch.status.name)}>{launch.status.name}</Badge>
          {launch.webcastLive && <Badge tone="live">Webcast live</Badge>}
        </div>
        <p className="eyebrow">Next SpaceX mission</p>
        <h1>{launch.missionName ?? launch.name}</h1>
        <p className="hero-vehicle">{launch.rocket} / {launch.orbit ?? 'Trajectory pending'}</p>
        <Countdown target={launch.net} />
        <div className="hero-meta">
          <div><span>Target</span><strong>{formatDate(launch.net, launch.precision.name)}</strong></div>
          <div><span>Launch site</span><strong>{launch.location ?? launch.pad ?? 'Pending'}</strong></div>
          <div><span>Weather</span><strong>{launch.probability === null ? 'Pending' : `${launch.probability}% favorable`}</strong></div>
        </div>
        <p className="hero-description">{launch.missionDescription ?? launch.status.description}</p>
        <div className="mission-actions">
          <DetailButton launch={launch} onSelect={onSelect}>Mission details</DetailButton>
          <CalendarLink launch={launch} />
        </div>
      </div>
    </article>
  )
}

function MissionCard({
  launch,
  index,
  onSelect,
}: {
  launch: Launch
  index: number
  onSelect: (launch: Launch) => void
}) {
  return (
    <article className="mission-card">
      <div className="mission-card__image">
        {launch.imageUrl && <img src={launch.imageUrl} alt="" loading="lazy" />}
        <span>{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="mission-card__body">
        <div className="badge-row">
          <Badge tone={statusTone(launch.status.name)}>{launch.status.abbrev}</Badge>
          <span className="updated">Updated {relativeTime(launch.lastUpdated)}</span>
        </div>
        <h3>{launch.missionName ?? launch.name}</h3>
        <p>{launch.rocket} · {launch.orbitAbbrev ?? 'Orbit TBD'}</p>
        <dl>
          <div><dt>Target</dt><dd>{formatDate(launch.net, launch.precision.name)}</dd></div>
          <div><dt>Site</dt><dd>{launch.pad ?? 'Pending'}</dd></div>
        </dl>
        <div className="mission-actions">
          <DetailButton launch={launch} onSelect={onSelect}>View mission</DetailButton>
          <CalendarLink launch={launch} />
        </div>
      </div>
    </article>
  )
}

function LaunchesSection() {
  const [selected, setSelected] = useState<Launch | null>(null)
  const [search, setSearch] = useState('')
  const [rocket, setRocket] = useState('all')
  const launches = useQuery({
    queryKey: ['launches'],
    queryFn: missionApi.launches,
    staleTime: 600_000,
    ...queryDefaults,
  })
  const searchValue = useMemo(
    () => search.trim().toLowerCase(),
    [search],
  )
  const rockets = useMemo(
    () =>
      Array.from(
        new Set(launches.data?.results.map((launch) => launch.rocket) ?? []),
      ).sort(),
    [launches.data?.results],
  )
  const filteredLaunches = useMemo(
    () =>
      launches.data?.results.filter((launch) => {
        const searchable = [
          launch.name,
          launch.missionName,
          launch.rocket,
          launch.location,
          launch.orbit,
          launch.status.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return (
          (!searchValue || searchable.includes(searchValue)) &&
          (rocket === 'all' || launch.rocket === rocket)
        )
      }) ?? [],
    [launches.data?.results, searchValue, rocket],
  )
  const manifestLaunches = useMemo(
    () =>
      searchValue || rocket !== 'all' ? filteredLaunches : filteredLaunches.slice(1),
    [filteredLaunches, searchValue, rocket],
  )

  return (
    <>
      <section className="hero-section" id="top">
        {launches.isPending ? <Loading count={1} /> : launches.isError ? (
          <ErrorState message={launches.error.message} retry={launches.refetch} />
        ) : launches.data.results[0] ? (
          <MissionHero launch={launches.data.results[0]} onSelect={setSelected} />
        ) : <div className="empty">No upcoming SpaceX missions are listed.</div>}
      </section>
      <section className="section" id="manifest">
        <SectionHeading
          index="01"
          eyebrow="Launch Library 2"
          title="Mission manifest"
          description={
            launches.data?.sampled
              ? `Showing ${launches.data.results.length} saved snapshot missions while live data is unavailable.`
              : `${launches.data?.total ?? 0} upcoming SpaceX launches tracked by The Space Devs.`
          }
        />
        {launches.isPending ? <Loading count={3} /> : launches.isError ? (
          <ErrorState message={launches.error.message} retry={launches.refetch} />
        ) : (
          <>
            {launches.data.stale && (
              <p className="sample-notice">
                {launches.data.sampled
                  ? 'Using the bundled LL2 snapshot until a live request succeeds.'
                  : 'Using the last successful LL2 response stored on disk while the upstream service recovers.'}
              </p>
            )}
            <div className="filter-bar" aria-label="Mission filters">
              <label>
                <span>Search missions</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Mission, site, orbit, status..."
                />
              </label>
              <label>
                <span>Rocket</span>
                <select value={rocket} onChange={(event) => setRocket(event.target.value)}>
                  <option value="all">All rockets</option>
                  {rockets.map((name) => <option value={name} key={name}>{name}</option>)}
                </select>
              </label>
              <span className="filter-count">{manifestLaunches.length} shown</span>
            </div>
            {manifestLaunches.length ? <div className="mission-grid">
              {manifestLaunches.map((launch) => (
                <MissionCard
                  launch={launch}
                  index={launches.data.results.indexOf(launch)}
                  onSelect={setSelected}
                  key={launch.id}
                />
              ))}
            </div> : <div className="empty">No missions match these filters.</div>}
          </>
        )}
      </section>
      {selected && (
        <MissionDetailPanel launch={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}

function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'Not published'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function MissionDetailContent({ detail }: { detail: LaunchDetail }) {
  const usefulTimeline = detail.timeline.filter((_item, index, values) => {
    if (values.length <= 10) return true
    return index === 0 || index === values.length - 1 || index % 3 === 0
  })

  return (
    <>
      <div className="detail-hero">
        {detail.imageUrl && <img src={detail.imageUrl} alt="" />}
        <div>
          <div className="badge-row">
            <Badge tone={statusTone(detail.status.name)}>{detail.status.name}</Badge>
            <Badge>{detail.precision.name} precision</Badge>
            {detail.stale && <Badge tone="warning">Saved data</Badge>}
          </div>
          <p className="eyebrow">{detail.rocket} / {detail.orbit ?? 'Orbit pending'}</p>
          <h2 id="mission-detail-title">{detail.missionName ?? detail.name}</h2>
          <p>{detail.missionDescription ?? detail.status.description}</p>
        </div>
      </div>

      <dl className="detail-metrics">
        <div><dt>Launch target</dt><dd>{formatDate(detail.net, detail.precision.name)}</dd></div>
        <div><dt>Window</dt><dd>{formatDate(detail.windowStart, detail.precision.name)} – {formatDate(detail.windowEnd, detail.precision.name)}</dd></div>
        <div><dt>Pad</dt><dd>{detail.pad ?? 'Pending'}<small>{detail.location}</small></dd></div>
        <div><dt>Weather</dt><dd>{detail.probability === null ? 'Pending' : `${detail.probability}% favorable`}<small>{detail.weatherConcerns}</small></dd></div>
      </dl>

      <div className="detail-columns">
        <section>
          <p className="panel-label">Launch vehicle</p>
          <h3>{detail.rocket}</h3>
          <p>{detail.rocketDetails.description ?? 'Vehicle details are not published.'}</p>
          <dl className="vehicle-specs">
            <div><dt>Reusable</dt><dd>{detail.rocketDetails.reusable === null ? 'Unknown' : detail.rocketDetails.reusable ? 'Yes' : 'No'}</dd></div>
            <div><dt>Height</dt><dd>{detail.rocketDetails.lengthMeters ? `${detail.rocketDetails.lengthMeters} m` : 'N/A'}</dd></div>
            <div><dt>LEO capacity</dt><dd>{detail.rocketDetails.leoCapacityKg ? `${formatNumber(detail.rocketDetails.leoCapacityKg)} kg` : 'N/A'}</dd></div>
            <div><dt>Launch cost</dt><dd>{formatMoney(detail.rocketDetails.launchCostUsd)}</dd></div>
          </dl>
        </section>
        <section>
          <p className="panel-label">Assigned stages</p>
          <div className="stage-list">
            {detail.stages.length ? detail.stages.map((stage, index) => (
              <article key={`${stage.type}-${index}`}>
                <div><strong>{stage.serialNumber}</strong><span>{stage.type}{stage.flightNumber ? ` · Flight ${stage.flightNumber}` : ''}</span></div>
                <Badge tone={stage.reused ? 'go' : 'neutral'}>{stage.reused ? 'Flight proven' : 'New / unknown'}</Badge>
                <p>{stage.landing?.description ?? stage.details ?? 'No recovery details published.'}</p>
              </article>
            )) : <p className="detail-muted">Stage assignments are pending.</p>}
          </div>
        </section>
      </div>

      {usefulTimeline.length > 0 && (
        <section className="timeline-section">
          <p className="panel-label">Flight timeline</p>
          <div className="timeline-list">
            {usefulTimeline.map((item, index) => (
              <article key={`${item.relativeTime}-${index}`}>
                <time>{item.relativeTime}</time>
                <div><strong>{item.label}</strong><span>{item.description}</span></div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="detail-columns detail-links">
        <section>
          <p className="panel-label">Watch & read</p>
          {[...detail.videos, ...detail.links].slice(0, 6).map((link) => (
            <a href={link.url} target="_blank" rel="noreferrer" key={link.url}>
              <div><strong>{link.title}</strong><span>{link.type} · {link.source}</span></div>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
          {detail.videos.length + detail.links.length === 0 && <p className="detail-muted">No media links are published yet.</p>}
        </section>
        <section>
          <p className="panel-label">Latest updates</p>
          {detail.updates.slice(0, 4).map((update) => (
            <article className="update-row" key={`${update.createdAt}-${update.comment}`}>
              <time>{relativeTime(update.createdAt)}</time>
              {update.url ? <a href={update.url} target="_blank" rel="noreferrer">{update.comment} ↗</a> : <span>{update.comment}</span>}
            </article>
          ))}
        </section>
      </div>

      <div className="detail-footer-links">
        <CalendarLink launch={detail} />
        {detail.flightClubUrl && <ExternalLink href={detail.flightClubUrl}>Flight Club trajectory</ExternalLink>}
        {detail.padDetails?.mapUrl && <ExternalLink href={detail.padDetails.mapUrl}>Launch site map</ExternalLink>}
        <ExternalLink href={detail.sourceUrl}>Raw LL2 record</ExternalLink>
      </div>
    </>
  )
}

function MissionDetailPanel({
  launch,
  onClose,
}: {
  launch: Launch
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['launch', launch.id],
    queryFn: () => missionApi.launch(launch.id),
    staleTime: 600_000,
    retry: 1,
  })

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div className="detail-backdrop" onMouseDown={onClose}>
      <div
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="detail-close" type="button" onClick={onClose} aria-label="Close mission details">×</button>
        {detail.isPending ? (
          <>
            <MissionSummary launch={launch} />
            <Loading count={2} />
          </>
        ) : detail.isError ? (
          <>
            <MissionSummary launch={launch} />
            <div className="detail-enrichment-error">
              <strong>Extended details are temporarily unavailable</strong>
              <p>{detail.error.message}</p>
              <button type="button" onClick={() => detail.refetch()}>Retry enrichment</button>
            </div>
          </>
        ) : <MissionDetailContent detail={detail.data} />}
      </div>
    </div>
  )
}

function MissionSummary({ launch }: { launch: Launch }) {
  return (
    <>
      <div className="detail-hero detail-hero--summary">
        {launch.imageUrl && <img src={launch.imageUrl} alt="" />}
        <div>
          <div className="badge-row">
            <Badge tone={statusTone(launch.status.name)}>{launch.status.name}</Badge>
            <Badge>{launch.precision.name} precision</Badge>
          </div>
          <p className="eyebrow">{launch.rocket} / {launch.orbit ?? 'Orbit pending'}</p>
          <h2 id="mission-detail-title">{launch.missionName ?? launch.name}</h2>
          <p>{launch.missionDescription ?? launch.status.description}</p>
        </div>
      </div>
      <dl className="detail-metrics">
        <div><dt>Launch target</dt><dd>{formatDate(launch.net, launch.precision.name)}</dd></div>
        <div><dt>Window</dt><dd>{formatDate(launch.windowStart, launch.precision.name)} – {formatDate(launch.windowEnd, launch.precision.name)}</dd></div>
        <div><dt>Pad</dt><dd>{launch.pad ?? 'Pending'}<small>{launch.location}</small></dd></div>
        <div><dt>Weather</dt><dd>{launch.probability === null ? 'Pending' : `${launch.probability}% favorable`}<small>{launch.weatherConcerns}</small></dd></div>
      </dl>
    </>
  )
}

function EventCard({ event }: { event: SpaceEvent }) {
  return (
    <article className="event-card">
      <div>
        <Badge tone={event.webcastLive ? 'live' : 'neutral'}>{event.type}</Badge>
        <span className="event-date">{formatDate(event.date, event.precision)}</span>
      </div>
      <h3>{event.name}</h3>
      <p>{event.description ?? 'Details have not been published.'}</p>
      <div className="event-footer">
        <span>{event.location ?? 'Location pending'}</span>
        <div className="link-row event-actions">
          {event.videoUrl ? (
            <ExternalLink href={event.videoUrl}>Watch</ExternalLink>
          ) : (
            <span className="event-action--disabled" aria-label="Watch unavailable">
              Watch unavailable
            </span>
          )}
          <ExternalLink href={event.sourceUrl}>Details</ExternalLink>
        </div>
      </div>
    </article>
  )
}

function EventsSection() {
  const [search, setSearch] = useState('')
  const [eventType, setEventType] = useState('all')
  const events = useQuery({
    queryKey: ['events'],
    queryFn: missionApi.events,
    staleTime: 600_000,
    ...queryDefaults,
  })
  const searchValue = useMemo(
    () => search.trim().toLowerCase(),
    [search],
  )
  const eventTypes = useMemo(
    () =>
      Array.from(
        new Set(events.data?.results.map((event) => event.type) ?? []),
      ).sort(),
    [events.data?.results],
  )
  const filteredEvents = useMemo(
    () =>
      events.data?.results.filter((event) => {
        const searchable = [
          event.name,
          event.description,
          event.location,
          event.type,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return (
          (!searchValue || searchable.includes(searchValue)) &&
          (eventType === 'all' || event.type === eventType)
        )
      }) ?? [],
    [events.data?.results, searchValue, eventType],
  )
  return (
    <section className="section" id="events">
      <SectionHeading index="02" eyebrow="Operations" title="Upcoming events" description="Static fires, mission milestones, and other SpaceX activity." />
      {events.isPending ? <Loading count={2} /> : events.isError ? (
        <ErrorState message={events.error.message} retry={events.refetch} />
      ) : events.data.results.length ? (
        <>
          {events.data.stale && (
            <p className="sample-notice">
              {events.data.sampled
                ? 'Using the bundled LL2 event snapshot until a live request succeeds.'
                : 'Using the last successful LL2 event response stored on disk.'}
            </p>
          )}
          <div className="filter-bar" aria-label="Event filters">
            <label>
              <span>Search events</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Event, type, location..."
              />
            </label>
            <label>
              <span>Event type</span>
              <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
                <option value="all">All event types</option>
                {eventTypes.map((type) => <option value={type} key={type}>{type}</option>)}
              </select>
            </label>
            <span className="filter-count">{filteredEvents.length} shown</span>
          </div>
          {filteredEvents.length ? (
            <div className="event-grid">{filteredEvents.map((event) => <EventCard event={event} key={event.id} />)}</div>
          ) : <div className="empty">No events match these filters.</div>}
        </>
      ) : <div className="empty">No upcoming events are currently listed.</div>}
    </section>
  )
}

function inclinationColor(inclination: number): string {
  const clamped = Math.min(Math.max(inclination, 0), 180)
  // 53° family (Starlink shells) → blue; 97.6° family (polar shells) → amber; else neutral
  if (Math.abs(clamped - 53) <= 6) return 'var(--blue)'
  if (Math.abs(clamped - 97.6) <= 6) return 'var(--amber)'
  return '#8b96a6'
}

function orbitStatus(altitudeKm: number): { label: string; tone: 'go' | 'warning' | 'neutral' } {
  if (altitudeKm < 400) return { label: 'RAISING ORBIT', tone: 'warning' }
  if (altitudeKm >= 500 && altitudeKm <= 600) return { label: 'OPERATIONAL', tone: 'go' }
  return { label: 'OTHER', tone: 'neutral' }
}

function OrbitPlot({ data }: { data: StarlinkSummary }) {
  const yTicks = [0, 30, 60, 90]
  const xTicks = [0, 90, 180, 270, 360]
  return (
    <div className="orbit-plot">
      <div className="orbit-plot__grid" />
      {/* Y-axis ticks */}
      {yTicks.map((v) => (
        <div key={`y-${v}`} className="orbit-tick orbit-tick--y" style={{ bottom: `${v}%` }}>
          <span className="orbit-tick__line" />
          <span className="orbit-tick__label">{v}°</span>
        </div>
      ))}
      {/* X-axis ticks */}
      {xTicks.map((v) => (
        <div key={`x-${v}`} className="orbit-tick orbit-tick--x" style={{ left: `${(v / 360) * 100}%` }}>
          <span className="orbit-tick__line" />
          <span className="orbit-tick__label">{v}°</span>
        </div>
      ))}
      {/* Data points */}
      {data.plot.map((point) => (
        <i
          key={point.id}
          className="orbit-dot"
          title={`${point.name} — Satellite à ${Math.round(point.altitudeKm ?? 0)} km d'altitude. Son orbite est inclinée de ${point.inclination.toFixed(1)}° par rapport à l'équateur (quasi polaire). RAAN = direction de l'orbite dans l'espace. Anomaly = où il se trouve sur son orbite à cet instant.`}
          style={{
            left: `${(point.raan / 360) * 100}%`,
            top: `${100 - (Math.min(point.inclination, 100) / 100) * 100}%`,
            opacity: 0.35 + (point.anomaly / 360) * 0.65,
            background: inclinationColor(point.inclination),
          }}
        />
      ))}
      {/* Axis labels */}
      <span className="axis-label axis-label--x" title="Right Ascension of Ascending Node (RAAN) : la direction dans l'espace où l'orbite croise l'équateur en allant vers le nord. Mesuré de 0 à 360°.">Right ascension of ascending node →</span>
      <span className="axis-label axis-label--y" title="Angle entre le plan de l'orbite et l'équateur terrestre. 0° = orbite équatoriale, 90° = orbite polaire.">Inclination</span>
      {/* Legend */}
      <div className="orbit-legend">
        <div className="orbit-legend__row">
          <span className="orbit-legend__dot" style={{ background: 'var(--blue)' }} />
          <span>53° shells (Starlink)</span>
        </div>
        <div className="orbit-legend__row">
          <span className="orbit-legend__dot" style={{ background: 'var(--amber)' }} />
          <span>97.6° shells (polar)</span>
        </div>
        <div className="orbit-legend__row">
          <span className="orbit-legend__dot" style={{ background: '#8b96a6' }} />
          <span>Other inclinations</span>
        </div>
        <div className="orbit-legend__row orbit-legend__row--muted">
          <span className="orbit-legend__opacity" />
          <span>Darker = more anomalous orbit</span>
        </div>
      </div>
    </div>
  )
}

function StarlinkSection() {
  const starlink = useQuery({
    queryKey: ['starlink'],
    queryFn: missionApi.starlink,
    staleTime: 7_200_000,
    ...queryDefaults,
  })
  return (
    <section className="section" id="starlink">
      <SectionHeading index="03" eyebrow="Space-Track GP" title="Starlink orbital elements" description="Where Starlink satellites are right now, and how they're moving — computed from Space-Track's general perturbations data, not live telemetry." />
      {starlink.isPending ? <Loading count={3} /> : starlink.isError ? (
        <ErrorState message={starlink.error.message} retry={starlink.refetch} />
      ) : (
        <>
          <div className="starlink-status">
            <div className="starlink-timestamp">
              <span className="starlink-timestamp__label">Last updated</span>
              <time className="starlink-timestamp__value" dateTime={starlink.data.fetchedAt}>
                {formatDate(starlink.data.fetchedAt, 'short')}
              </time>
            </div>
            <div className="starlink-status__right">
              <Badge tone={starlink.data.stale ? 'warning' : 'go'}>
                {starlink.data.sampled
                  ? 'Limited bootstrap sample'
                  : starlink.data.stale
                    ? 'Cached dataset'
                    : 'Current dataset'}
              </Badge>
              <span>Fetched {relativeTime(starlink.data.fetchedAt)}</span>
            </div>
          </div>
          {starlink.data.sampled && (
            <p className="sample-notice">
              Showing a {starlink.data.count}-record Space-Track snapshot while the
              first full download is cooling down. Metrics below describe only
              this sample.
            </p>
          )}
          <div className="orbital-metrics">
            <div><span title="Nombre d'objets spatiaux Starlink suivis dans la base de données.">Tracked objects</span><strong>{formatNumber(starlink.data.count)}</strong></div>
            <div><span title="Altitude moyenne de la cohorte. Attention : mélange satellites en raising orbit (bas) et opérationnels (550 km).">Mean altitude</span><strong>{formatNumber(starlink.data.averageAltitudeKm)} <small>km</small></strong></div>
            <div><span title="Inclinaison moyenne. Les Starlinks opèrent principalement à 53° (coquille principale) et 97,6° (polaire).">Mean inclination</span><strong>{formatNumber(starlink.data.averageInclination, 1)}<small>°</small></strong></div>
            <div><span title="Durée moyenne d'un tour complet autour de la Terre. À 550 km, c'est environ 95 minutes.">Mean period</span><strong>{formatNumber(starlink.data.averagePeriodMinutes, 1)} <small>min</small></strong></div>
          </div>
          <div className="position-panel">
            <div title="Points verts = positions calculées des satellites Starlink. Ces positions sont des estimations basées sur les éléments orbitaux publiés — ce n'est pas un suivi en temps réel. Le modèle utilisé est un Keplerian simplifié (pas SGP4), l'erreur est de l'ordre de plusieurs km.">
              <p className="panel-label">Where they are right now</p>
              <p>
                Estimated positions from the latest Space-Track orbital elements.
                Calculated at {formatDate(starlink.data.calculatedAt)} — these are
                approximate, not live locations.
              </p>
            </div>
            <Suspense fallback={<div className="earth-globe earth-globe--loading">Preparing 3D Earth…</div>}>
              <EarthGlobe data={starlink.data} />
            </Suspense>
          </div>
          <div className="orbit-layout">
            <div>
              <p className="panel-label">Where the satellites are — each dot is one spacecraft</p>
              <span className="orbit-plot-help" title="Chaque point représente un satellite Starlink. Son position sur le graphique indique son inclinaison orbitale (axe vertical, en degrés) et sa direction dans l'espace (RAAN, axe horizontal, en degrés). Plus le point est sombre, plus son anomalie orbitale est élevée — c'est-à-dire sa position sur son orbite à cet instant.">
                <OrbitPlot data={starlink.data} />
              </span>
            </div>
            <div>
              <p className="panel-label">Freshest element sets</p>
              <p className="satellite-list-note">
                Altitude tells the story: below 400 km the satellites are still climbing
                to their operational slot; around 550 km they&apos;re in service.
              </p>
              <div className="satellite-list">
                {starlink.data.satellites.slice(0, 7).map((satellite) => {
                  const status = orbitStatus(satellite.altitudeKm)
                  const altitudeTooltip = satellite.altitudeKm < 350
                    ? `Altitude orbitale : ${Math.round(satellite.altitudeKm)} km. En route vers sa position opérationnelle (raising orbit) — ces satellites viennent d'être lancés et montent lentement vers leur orbite finale.`
                    : `Altitude orbitale : ${Math.round(satellite.altitudeKm)} km. À cette altitude, le satellite orbite à environ 95 minutes par tour autour de la Terre.`
                  const inclinationTooltip = Math.abs(satellite.inclination - 53) <= 6
                    ? `Inclinaison : ${satellite.inclination.toFixed(1)}°. Coquille principale Starlink — couvre les latitudes moyennes.`
                    : Math.abs(satellite.inclination - 97.6) <= 6
                      ? `Inclinaison : ${satellite.inclination.toFixed(1)}°. Coquille polaire (direct-to-cell) — orbite presque perpendiculaire à l'équateur, couvre aussi les pôles.`
                      : `Inclinaison : ${satellite.inclination.toFixed(1)}°. Angle entre le plan de l'orbite et l'équateur terrestre.`
                  const statusTooltip = status.label === 'RAISING ORBIT'
                    ? 'RAISING ORBIT : le satellite est en cours de montée vers son orbite opérationnelle (généralement 550 km).'
                    : status.label === 'OPERATIONAL'
                      ? 'OPERATIONAL : le satellite est en orbite opérationnelle et fonctionne normalement.'
                      : 'Autre : statut non classé dans les catégories standards.'
                  return (
                    <article
                      key={satellite.noradId}
                      className="satellite-row"
                      style={{ borderLeftColor: inclinationColor(satellite.inclination) }}
                    >
                      <div>
                        <strong>{satellite.name}</strong>
                        <span>NORAD {satellite.noradId}</span>
                      </div>
                      <div>
                        <strong title={altitudeTooltip}>{formatNumber(satellite.altitudeKm)} km</strong>
                        <Badge tone={status.tone} className="satellite-status" title={statusTooltip}>
                          {status.label}
                        </Badge>
                      </div>
                      <div className="satellite-inclination" style={{ color: inclinationColor(satellite.inclination) }} title={inclinationTooltip}>
                        {formatNumber(satellite.inclination, 1)}° inc.
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function CacheStatusSection() {
  const cache = useQuery({
    queryKey: ['cache-status'],
    queryFn: missionApi.cacheStatus,
    staleTime: 5_000,
    refetchInterval: 5_000,
    ...queryDefaults,
  })

  return (
    <section className="section" id="data-status">
      <SectionHeading
        index="04"
        eyebrow="Local persistence"
        title="Data cache status"
        description="Safe operational metadata for the on-disk SQLite cache. Cached payload contents remain server-side."
      />
      {cache.isPending ? <Loading count={3} /> : cache.isError ? (
        <ErrorState message={cache.error.message} retry={cache.refetch} />
      ) : (
        <>
          <div className="cache-grid">
            {cache.data.sources.map((source) => (
              <article className="cache-card" key={source.key}>
                <Badge tone={source.fresh ? 'go' : 'warning'}>
                  {source.fetchedAt ? (source.fresh ? 'Fresh' : 'Refresh due') : 'Empty'}
                </Badge>
                <h3>{source.label}</h3>
                <dl>
                  <div>
                    <dt>Stored</dt>
                    <dd>{source.fetchedAt ? relativeTime(source.fetchedAt) : 'Awaiting first successful response'}</dd>
                  </div>
                  <div>
                    <dt>Payload</dt>
                    <dd>{source.sizeBytes ? `${formatNumber(source.sizeBytes)} bytes` : 'No row'}</dd>
                  </div>
                  <div>
                    <dt>Next refresh attempt</dt>
                    <dd>
                      {timeUntil(source.nextAttemptAt)}
                      <small>{source.nextAttemptReason}</small>
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <p className="cache-summary">
            Rich mission details stored: <strong>{cache.data.missionDetailsStored}</strong>
          </p>
        </>
      )}
    </section>
  )
}

export default function MissionApp() {
  return (
    <div className="app">
      <header className="header">
        <a className="brand" href="#top"><strong>SPACEX</strong><span>MISSION DATA</span></a>
        <nav><a href="#manifest">Manifest</a><a href="#events">Events</a><a href="#starlink">Starlink</a><a href="#next-launches">Next</a><a href="#stats">Stats</a><a href="#data-status">Data status</a></nav>
        <div className="source-state"><i /> LL2 + SPACE-TRACK</div>
      </header>
      <main><LaunchesSection /><EventsSection /><StarlinkSection /><NextLaunchesSection /><StatsDashboard /><CacheStatusSection /></main>
      <footer>
        <div className="brand"><strong>SPACEX</strong><span>COMMUNITY DATA</span></div>
        <p>Launch data by The Space Devs. Orbital elements by Space-Track.org. Not affiliated with SpaceX.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  )
}
