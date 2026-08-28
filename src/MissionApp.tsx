import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Countdown, ErrorState, ExternalLink, Loading, SectionHeading } from './components'
import { missionApi } from './api'
import type { Launch, LaunchDetail, SpaceEvent, StarlinkSummary } from './types'
import { formatDate, formatNumber, relativeTime } from './utils'
import './styles.css'

const queryDefaults = { retry: 1, refetchOnWindowFocus: false }

function statusTone(status: string) {
  const value = status.toLowerCase()
  if (value.includes('go') || value.includes('success')) return 'go' as const
  if (value.includes('hold') || value.includes('fail')) return 'warning' as const
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
        <DetailButton launch={launch} onSelect={onSelect}>Mission details</DetailButton>
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
        <DetailButton launch={launch} onSelect={onSelect}>View mission</DetailButton>
      </div>
    </article>
  )
}

function LaunchesSection() {
  const [selected, setSelected] = useState<Launch | null>(null)
  const launches = useQuery({
    queryKey: ['launches'],
    queryFn: missionApi.launches,
    staleTime: 600_000,
    ...queryDefaults,
  })

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
            <div className="mission-grid">
              {launches.data.results.slice(1).map((launch, index) => (
                <MissionCard
                  launch={launch}
                  index={index + 1}
                  onSelect={setSelected}
                  key={launch.id}
                />
              ))}
            </div>
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
  const events = useQuery({
    queryKey: ['events'],
    queryFn: missionApi.events,
    staleTime: 600_000,
    ...queryDefaults,
  })
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
          <div className="event-grid">{events.data.results.map((event) => <EventCard event={event} key={event.id} />)}</div>
        </>
      ) : <div className="empty">No upcoming events are currently listed.</div>}
    </section>
  )
}

function OrbitPlot({ data }: { data: StarlinkSummary }) {
  return (
    <div className="orbit-plot">
      <div className="orbit-plot__grid" />
      {data.plot.map((point) => (
        <i
          key={point.id}
          title={`${point.name} · ${point.inclination.toFixed(1)}° inclination`}
          style={{
            left: `${(point.raan / 360) * 100}%`,
            top: `${100 - (Math.min(point.inclination, 100) / 100) * 100}%`,
            opacity: 0.35 + (point.anomaly / 360) * 0.65,
          }}
        />
      ))}
      <span className="axis-label axis-label--x">Right ascension of ascending node →</span>
      <span className="axis-label axis-label--y">Inclination</span>
    </div>
  )
}

function StarlinkSection() {
  const starlink = useQuery({
    queryKey: ['starlink'],
    queryFn: missionApi.starlink,
    staleTime: 7_200_000,
    ...queryDefaults,
    retry: false,
  })
  return (
    <section className="section" id="starlink">
      <SectionHeading index="03" eyebrow="CelesTrak GP" title="Starlink orbital elements" description="Current general perturbations data—not live spacecraft telemetry—summarized from CelesTrak." />
      {starlink.isPending ? <Loading count={3} /> : starlink.isError ? (
        <ErrorState message={starlink.error.message} retry={starlink.refetch} />
      ) : (
        <>
          <div className="starlink-status">
            <Badge tone={starlink.data.stale ? 'warning' : 'go'}>
              {starlink.data.sampled
                ? 'Limited bootstrap sample'
                : starlink.data.stale
                  ? 'Cached dataset'
                  : 'Current dataset'}
            </Badge>
            <span>Fetched {relativeTime(starlink.data.fetchedAt)}</span>
            {starlink.data.newestEpoch && <span>Newest epoch {relativeTime(starlink.data.newestEpoch)}</span>}
          </div>
          {starlink.data.sampled && (
            <p className="sample-notice">
              Showing a {starlink.data.count}-record CelesTrak snapshot while the
              first full download is cooling down. Metrics below describe only
              this sample.
            </p>
          )}
          <div className="orbital-metrics">
            <div><span>Tracked objects</span><strong>{formatNumber(starlink.data.count)}</strong></div>
            <div><span>Mean altitude</span><strong>{formatNumber(starlink.data.averageAltitudeKm)} <small>km</small></strong></div>
            <div><span>Mean inclination</span><strong>{formatNumber(starlink.data.averageInclination, 1)}<small>°</small></strong></div>
            <div><span>Mean period</span><strong>{formatNumber(starlink.data.averagePeriodMinutes, 1)} <small>min</small></strong></div>
          </div>
          <div className="orbit-layout">
            <div>
              <p className="panel-label">Orbital plane distribution · sampled elements</p>
              <OrbitPlot data={starlink.data} />
            </div>
            <div>
              <p className="panel-label">Freshest element sets</p>
              <div className="satellite-list">
                {starlink.data.satellites.slice(0, 7).map((satellite) => (
                  <article key={satellite.noradId}>
                    <div><strong>{satellite.name}</strong><span>NORAD {satellite.noradId}</span></div>
                    <div><strong>{formatNumber(satellite.altitudeKm)} km</strong><span>{formatNumber(satellite.inclination, 1)}° inc.</span></div>
                  </article>
                ))}
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
    staleTime: 30_000,
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
                    <dt>Refresh</dt>
                    <dd>{source.refreshAfter ? relativeTime(source.refreshAfter) : 'On next request'}</dd>
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
        <nav><a href="#manifest">Manifest</a><a href="#events">Events</a><a href="#starlink">Starlink</a><a href="#data-status">Data status</a></nav>
        <div className="source-state"><i /> LL2 + CELESTRAK</div>
      </header>
      <main><LaunchesSection /><EventsSection /><StarlinkSection /><CacheStatusSection /></main>
      <footer>
        <div className="brand"><strong>SPACEX</strong><span>COMMUNITY DATA</span></div>
        <p>Launch data by The Space Devs. Orbital elements by CelesTrak. Not affiliated with SpaceX.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  )
}
