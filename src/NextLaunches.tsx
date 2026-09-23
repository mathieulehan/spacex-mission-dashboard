import { useQuery } from '@tanstack/react-query'
import { SectionHeading, Loading, ErrorState, Countdown } from './components'
import { missionApi } from './api'
import { formatDate } from './utils'
import type { Launch } from './types'

function NextLaunchCard({ launch }: { launch: Launch }) {
  const missionLabel = launch.missionName ?? launch.name
  const locationLabel = launch.location ?? launch.pad ?? 'Unknown site'

  return (
    <article className="next-launch-card">
      <header className="next-launch-card__header">
        <div>
          <p className="eyebrow">Next launch</p>
          <h3 className="next-launch-card__name">{launch.name}</h3>
        </div>
        <Countdown target={launch.net} />
      </header>
      <div className="next-launch-card__body">
        <div>
          <p className="next-launch-card__meta-label">Mission</p>
          <p>{missionLabel}</p>
        </div>
        <div>
          <p className="next-launch-card__meta-label">Rocket</p>
          <p>{launch.rocket}</p>
        </div>
        <div>
          <p className="next-launch-card__meta-label">Site</p>
          <p>{locationLabel}</p>
        </div>
        <div>
          <p className="next-launch-card__meta-label">Window</p>
          <p>{formatDate(launch.windowStart)} – {formatDate(launch.windowEnd)}</p>
        </div>
      </div>
      {launch.webcastLive && (
        <a
          className="next-launch-card__webcast"
          href={`https://www.spacex.com/launches/${launch.id}/`}
          target="_blank"
          rel="noreferrer"
        >
          Live stream <span aria-hidden="true">↗</span>
        </a>
      )}
    </article>
  )
}

export function NextLaunchesSection() {
  const query = useQuery({
    queryKey: ['next-launches'],
    queryFn: missionApi.nextLaunches,
    refetchInterval: 60_000, // 1 minute — launch times are precise, refresher fréquent
    refetchOnWindowFocus: true,
    retry: 1,
  })

  if (query.isPending) return <Loading count={3} />
  if (query.isError) return <ErrorState message={query.error.message} retry={() => query.refetch()} />

  const { results, stale } = query.data

  if (results.length === 0) {
    return (
      <section className="next-launches-section" id="next-launches">
        <div className="section-heading">
          <span className="section-index">00</span>
          <div>
            <p className="eyebrow">Upcoming</p>
            <h2>Prochains lancements</h2>
            <p>Pas de lancement SpaceX planifié dans les prochains jours.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="next-launches-section" id="next-launches">
      <div className="section-heading">
        <span className="section-index">00</span>
        <div>
          <p className="eyebrow">Upcoming</p>
          <h2>Prochains lancements</h2>
          <p>Les 6 prochains lancements SpaceX, triés par date de lancement. Sources : LL2 API (The Space Devs).</p>
        </div>
      </div>

      <div className="next-launches-grid">
        {results.map((launch) => (
          <NextLaunchCard key={launch.id} launch={launch} />
        ))}
      </div>

      {stale && (
        <p className="section-stale">
          <span className="badge badge--warning">Données mises en cache</span>
          La source de données est temporairement inaccessible — affichage des dernières données connues.
        </p>
      )}
    </section>
  )
}
