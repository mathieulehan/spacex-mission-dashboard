import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Countdown, ErrorState, ExternalLink, Loading, SectionHeading } from './components'
import { missionApi } from './api'
import { launchCalendarHref } from './calendar'
import type { Launch, LaunchDetail, SpaceEvent, StarlinkSummary } from './types'
import { formatDate, formatNumber, relativeTime, timeUntil } from './utils'
import { StarlinkPolarPlot } from './StarlinkPolarPlot'
import { StarlinkGroundTrack } from './StarlinkGroundTrack'
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
      aria-label={`Ajouter ${launch.missionName ?? launch.name} au calendrier`}
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
          {launch.webcastLive && <Badge tone="live">Webcast en direct</Badge>}
        </div>
        <p className="eyebrow">Prochaine mission SpaceX</p>
        <h1>{launch.missionName ?? launch.name}</h1>
        <p className="hero-vehicle">{launch.rocket} / {launch.orbit ?? 'Trajectoire en attente'}</p>
        <Countdown target={launch.net} />
        <div className="hero-meta">
          <div><span>Cible</span><strong>{formatDate(launch.net, launch.precision.name)}</strong></div>
          <div><span>Site de lancement</span><strong>{launch.location ?? launch.pad ?? 'En attente'}</strong></div>
          <div><span>Météo</span><strong>{launch.probability === null ? 'En attente' : `${launch.probability}% favorable`}</strong></div>
        </div>
        <p className="hero-description">{launch.missionDescription ?? launch.status.description}</p>
        <div className="mission-actions">
          <DetailButton launch={launch} onSelect={onSelect}>Détails de la mission</DetailButton>
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
        <p>{launch.rocket} · {launch.orbitAbbrev ?? 'Orbite TBD'}</p>
        <dl>
          <div><dt>Cible</dt><dd>{formatDate(launch.net, launch.precision.name)}</dd></div>
          <div><dt>Site</dt><dd>{launch.pad ?? 'En attente'}</dd></div>
        </dl>
        <div className="mission-actions">
          <DetailButton launch={launch} onSelect={onSelect}>Voir la mission</DetailButton>
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
        ) : <div className="empty">Aucune mission SpaceX à venir n'est listée.</div>}
      </section>
      <section className="section" id="manifest">
        <SectionHeading
          index="01"
          eyebrow="Launch Library 2"
          title="Manifest de missions"
          description={
            launches.data?.sampled
              ? `Affichage de ${launches.data.results.length} missions de l'instantané sauvegardé pendant que les données live sont indisponibles.`
              : `${launches.data?.total ?? 0} prochains lancements SpaceX suivis par The Space Devs.`
          }
        />
        {launches.isPending ? <Loading count={3} /> : launches.isError ? (
          <ErrorState message={launches.error.message} retry={launches.refetch} />
        ) : (
          <>
            {launches.data.stale && (
              <p className="sample-notice">
                {launches.data.sampled
                  ? 'Utilisation de l\'instantané LL2 intégré jusqu\'à ce qu\'une requête live réussisse.'
                  : 'Utilisation de la dernière réponse LL2 successful stockée sur disque pendant que le service amont se remet.'}
              </p>
            )}
            <div className="filter-bar" aria-label="Filtres de mission">
              <label>
                <span>Rechercher des missions</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Mission, site, orbite, statut..."
                />
              </label>
              <label>
                <span>Fusée</span>
                <select value={rocket} onChange={(event) => setRocket(event.target.value)}>
                  <option value="all">Toutes les fusées</option>
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
            </div> : <div className="empty">Aucune mission ne correspond à ces filtres.</div>}
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
  if (value === null || !Number.isFinite(value)) return 'Non publié'
  return new Intl.NumberFormat('fr-FR', {
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
            {detail.stale && <Badge tone="warning">Données sauvegardées</Badge>}
          </div>
          <p className="eyebrow">{detail.rocket} / {detail.orbit ?? 'Orbite en attente'}</p>
          <h2 id="mission-detail-title">{detail.missionName ?? detail.name}</h2>
          <p>{detail.missionDescription ?? detail.status.description}</p>
        </div>
      </div>

      <dl className="detail-metrics">
        <div><dt>Date de lancement</dt><dd>{formatDate(detail.net, detail.precision.name)}</dd></div>
        <div><dt>Fenêtre</dt><dd>{formatDate(detail.windowStart, detail.precision.name)} – {formatDate(detail.windowEnd, detail.precision.name)}</dd></div>
        <div><dt>Patère</dt><dd>{detail.pad ?? 'En attente'}<small>{detail.location}</small></dd></div>
        <div><dt>Météo</dt><dd>{detail.probability === null ? 'En attente' : `${detail.probability}% favorable`}<small>{detail.weatherConcerns}</small></dd></div>
      </dl>

      <div className="detail-columns">
        <section>
          <p className="panel-label">Véhicule de lancement</p>
          <h3>{detail.rocket}</h3>
          <p>{detail.rocketDetails.description ?? 'Les détails du véhicule ne sont pas publiés.'}</p>
          <dl className="vehicle-specs">
            <div><dt>Réutilisable</dt><dd>{detail.rocketDetails.reusable === null ? 'Inconnu' : detail.rocketDetails.reusable ? 'Oui' : 'Non'}</dd></div>
            <div><dt>Hauteur</dt><dd>{detail.rocketDetails.lengthMeters ? `${detail.rocketDetails.lengthMeters} m` : 'N/A'}</dd></div>
            <div><dt>Capacité LEO</dt><dd>{detail.rocketDetails.leoCapacityKg ? `${formatNumber(detail.rocketDetails.leoCapacityKg)} kg` : 'N/A'}</dd></div>
            <div><dt>Coût de lancement</dt><dd>{formatMoney(detail.rocketDetails.launchCostUsd)}</dd></div>
          </dl>
        </section>
        <section>
          <p className="panel-label">Rotors assignés</p>
          <div className="stage-list">
            {detail.stages.length ? detail.stages.map((stage, index) => (
              <article key={`${stage.type}-${index}`}>
                <div><strong>{stage.serialNumber}</strong><span>{stage.type}{stage.flightNumber ? ` · Vol ${stage.flightNumber}` : ''}</span></div>
                <Badge tone={stage.reused ? 'go' : 'neutral'}>{stage.reused ? 'Certifié vol' : 'Neuf / inconnu'}</Badge>
                <p>{stage.landing?.description ?? stage.details ?? 'Aucun détail de récupération publié.'}</p>
              </article>
            )) : <p className="detail-muted">Les assignations de rotors sont en attente.</p>}
          </div>
        </section>
      </div>

      {usefulTimeline.length > 0 && (
        <section className="timeline-section">
          <p className="panel-label">Chronologie du vol</p>
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
          <p className="panel-label">Regarder & lire</p>
          {[...detail.videos, ...detail.links].slice(0, 6).map((link) => (
            <a href={link.url} target="_blank" rel="noreferrer" key={link.url}>
              <div><strong>{link.title}</strong><span>{link.type} · {link.source}</span></div>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
          {detail.videos.length + detail.links.length === 0 && <p className="detail-muted">Aucun lien média publié pour le moment.</p>}
        </section>
        <section>
          <p className="panel-label">Dernières mises à jour</p>
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
        {detail.flightClubUrl && <ExternalLink href={detail.flightClubUrl}>Trajectoire Flight Club</ExternalLink>}
        {detail.padDetails?.mapUrl && <ExternalLink href={detail.padDetails.mapUrl}>Carte du site de lancement</ExternalLink>}
        <ExternalLink href={detail.sourceUrl}>Enregistrement LL2 brut</ExternalLink>
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
        <button className="detail-close" type="button" onClick={onClose} aria-label="Fermer les détails de la mission">×</button>
        {detail.isPending ? (
          <>
            <MissionSummary launch={launch} />
            <Loading count={2} />
          </>
        ) : detail.isError ? (
          <>
            <MissionSummary launch={launch} />
            <div className="detail-enrichment-error">
              <strong>Les détails étendus sont temporairement indisponibles</strong>
              <p>{detail.error.message}</p>
              <button type="button" onClick={() => detail.refetch()}>Réessayer l'enrichissement</button>
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
          <p className="eyebrow">{launch.rocket} / {launch.orbit ?? 'Orbite en attente'}</p>
          <h2 id="mission-detail-title">{launch.missionName ?? launch.name}</h2>
          <p>{launch.missionDescription ?? launch.status.description}</p>
        </div>
      </div>
      <dl className="detail-metrics">
        <div><dt>Date de lancement</dt><dd>{formatDate(launch.net, launch.precision.name)}</dd></div>
        <div><dt>Fenêtre</dt><dd>{formatDate(launch.windowStart, launch.precision.name)} – {formatDate(launch.windowEnd, launch.precision.name)}</dd></div>
        <div><dt>Patère</dt><dd>{launch.pad ?? 'En attente'}<small>{launch.location}</small></dd></div>
        <div><dt>Météo</dt><dd>{launch.probability === null ? 'En attente' : `${launch.probability}% favorable`}<small>{launch.weatherConcerns}</small></dd></div>
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
        <span>{event.location ?? 'Lieu en attente'}</span>
        <div className="link-row event-actions">
          {event.videoUrl ? (
            <ExternalLink href={event.videoUrl}>Regarder</ExternalLink>
          ) : (
            <span className="event-action--disabled" aria-label="Regarder indisponible">
              Regarder indisponible
            </span>
          )}
          <ExternalLink href={event.sourceUrl}>Détails</ExternalLink>
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
      <SectionHeading index="02" eyebrow="Opérations" title="Événements à venir" description="Fusées statiques, jalons de mission et autre activité SpaceX." />
      {events.isPending ? <Loading count={2} /> : events.isError ? (
        <ErrorState message={events.error.message} retry={events.refetch} />
      ) : events.data.results.length ? (
        <>
          {events.data.stale && (
            <p className="sample-notice">
              {events.data.sampled
                ? 'Utilisation de l\'instantané LL2 d\'événements intégré jusqu\'à ce qu\'une requête live réussisse.'
                : 'Utilisation de la dernière réponse LL2 d\'événements successful stockée sur disque.'}
            </p>
          )}
          <div className="filter-bar" aria-label="Filtres d'événements">
            <label>
              <span>Rechercher des événements</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Événement, type, lieu..."
              />
            </label>
            <label>
              <span>Type d'événement</span>
              <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
                <option value="all">Tous les types d'événements</option>
                {eventTypes.map((type) => <option value={type} key={type}>{type}</option>)}
              </select>
            </label>
            <span className="filter-count">{filteredEvents.length} shown</span>
          </div>
          {filteredEvents.length ? (
            <div className="event-grid">{filteredEvents.map((event) => <EventCard event={event} key={event.id} />)}</div>
          ) : <div className="empty">Aucun événement ne correspond à ces filtres.</div>}
        </>
      ) : <div className="empty">Aucun événement à venir n'est actuellement listé.</div>}
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
          title={`${point.name} · ${point.inclination.toFixed(1)}° inclinaison`}
          style={{
            left: `${(point.raan / 360) * 100}%`,
            top: `${100 - (Math.min(point.inclination, 100) / 100) * 100}%`,
            opacity: 0.35 + (point.anomaly / 360) * 0.65,
          }}
        />
      ))}
      <span className="axis-label axis-label--x">Ascension droite du nœud ascendant →</span>
      <span className="axis-label axis-label--y">Inclinaison</span>
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
      <SectionHeading index="03" eyebrow="Space-Track GP" title="Éléments orbitaux Starlink" description="Données de perturbations générales actuelles — pas de télémétrie live — résumées de Space-Track." />
      {starlink.isPending ? <Loading count={3} /> : starlink.isError ? (
        <ErrorState message={starlink.error.message} retry={starlink.refetch} />
      ) : (
        <>
          <div className="starlink-status">
            <Badge tone={starlink.data.stale ? 'warning' : 'go'}>
              {starlink.data.sampled
                ? 'Échantillon bootstrap limité'
                : starlink.data.stale
                  ? 'Jeu de données en cache'
                  : 'Jeu de données actuel'}
            </Badge>
            <span>Récupéré {relativeTime(starlink.data.fetchedAt)}</span>
            {starlink.data.newestEpoch && <span>Époque la plus récente {relativeTime(starlink.data.newestEpoch)}</span>}
          </div>
          {starlink.data.sampled && (
            <p className="sample-notice">
              Affichage d'un instantané Space-Track de {starlink.data.count} enregistrements pendant que
              le premier téléchargement complet refroidit. Les métriques ci-dessous décrivent seulement
              cet échantillon.
            </p>
          )}
          <div className="orbital-metrics">
            <div><span>Objets tracés</span><strong>{formatNumber(starlink.data.count)}</strong></div>
            <div><span>Altitude moyenne</span><strong>{formatNumber(starlink.data.averageAltitudeKm)} <small>km</small></strong></div>
            <div><span>Inclinaison moyenne</span><strong>{formatNumber(starlink.data.averageInclination, 1)}<small>°</small></strong></div>
            <div><span>Période moyenne</span><strong>{formatNumber(starlink.data.averagePeriodMinutes, 1)} <small>min</small></strong></div>
          </div>
          <div className="position-panel">
            <div>
              <p className="panel-label">Positions au sol calculées · objets échantillonnés</p>
              <p>
                Estimé à {formatDate(starlink.data.calculatedAt)} à partir des
                derniers éléments orbitaux Space-Track publiés. Le calcul
                suppose la gravité terrestre sans manoeuvres de satellites ni
                effets atmosphériques, donc les positions sont approximatives — pas de télémétrie live.
              </p>
            </div>
            <Suspense fallback={<div className="earth-globe earth-globe--loading">Préparation de la Terre 3D…</div>}>
              <EarthGlobe data={starlink.data} />
            </Suspense>
          </div>

          {/* ── Sous-section : répartition orbitale + satellites récents ── */}
          <div className="starlink-sub-section">
            <div className="starlink-sub-section__header">
              <p className="panel-label">Répartition orbitale</p>
              <span className="sub-section-tag">OrbitPlot + liste</span>
            </div>
            <div className="orbit-layout">
              <div>
                <OrbitPlot data={starlink.data} />
              </div>
              <div>
                <p className="panel-label">Éléments les plus récents</p>
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
          </div>

          {/* ── Sous-section : Polar Plot + Ground Track ── */}
          <div className="starlink-sub-section">
            <div className="starlink-sub-section__header">
              <p className="panel-label">Analyse avancée</p>
              <span className="sub-section-tag">Polar + Ground Track</span>
            </div>
            <div className="starlink-extra">
              <div className="starlink-extra__panel">
                <p className="panel-label">Histogramme polaire RAAN · clusters de plans orbitaux</p>
                <StarlinkPolarPlot data={starlink.data} />
              </div>
              <div className="starlink-extra__panel">
                <p className="panel-label">Positions satellites · vue 2D</p>
                <StarlinkGroundTrack data={starlink.data} />
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
        eyebrow="Persistance locale"
        title="État du cache de données"
        description="Métadonnées opérationnelles sûres pour le cache SQLite sur disque. Les contenus de payload en cache restent côté serveur."
      />
      {cache.isPending ? <Loading count={3} /> : cache.isError ? (
        <ErrorState message={cache.error.message} retry={cache.refetch} />
      ) : (
        <>
          <div className="cache-grid">
            {cache.data.sources.map((source) => (
              <article className="cache-card" key={source.key}>
                <Badge tone={source.fresh ? 'go' : 'warning'}>
                  {source.fetchedAt ? (source.fresh ? 'Récent' : 'Actualisation requise') : 'Vide'}
                </Badge>
                <h3>{source.label}</h3>
                <dl>
                  <div>
                    <dt>Stocké</dt>
                    <dd>{source.fetchedAt ? relativeTime(source.fetchedAt) : 'En attente de première réponse réussie'}</dd>
                  </div>
                  <div>
                    <dt>Payload</dt>
                    <dd>{source.sizeBytes ? `${formatNumber(source.sizeBytes)} octets` : 'Pas de ligne'}</dd>
                  </div>
                  <div>
                    <dt>Prochaine tentative d'actualisation</dt>
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
            Détails de mission enrichis stockés : <strong>{cache.data.missionDetailsStored}</strong>
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
        <a className="brand" href="#top"><strong>SPACEX</strong><span>DONNÉES DE MISSION</span></a>
        <nav><a href="#manifest">Manifest</a><a href="#events">Événements</a><a href="#starlink">Starlink</a><a href="#data-status">État des données</a></nav>
        <div className="source-state"><i /> LL2 + SPACE-TRACK</div>
      </header>
      <main><LaunchesSection /><EventsSection /><StarlinkSection /><CacheStatusSection /></main>
      <footer>
        <div className="brand"><strong>SPACEX</strong><span>DONNÉES COMMUNAUTAIRES</span></div>
        <p>Données de lancement par The Space Devs. Éléments orbitaux par Space-Track.org. Non affilié à SpaceX.</p>
        <a href="#top">Retour en haut ↑</a>
      </footer>
    </div>
  )
}
