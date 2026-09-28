import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { statsApi } from './api';
import { SectionHeading } from './components/SectionHeading';
import { Badge } from './components/Badge';
import { Loading } from './components/Loading';
import { ErrorState } from './components/ErrorState';
import type { Booster } from './types';

// ── Sorting helpers ────────────────────────────────────────────────────────────

type SortKey = 'serialNumber' | 'flights' | 'landingRate';
type SortDir = 'asc' | 'desc';

function sortBoosters(boosters: Booster[], key: SortKey, dir: SortDir): Booster[] {
  const sorted = [...boosters];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (key === 'serialNumber') {
      cmp = a.serialNumber.localeCompare(b.serialNumber);
    } else if (key === 'flights') {
      cmp = a.flights - b.flights;
    } else {
      cmp = a.landingRate - b.landingRate;
    }
    return dir === 'desc' ? -cmp : cmp;
  });
  return sorted;
}

// ── Status badge for landing rate ──────────────────────────────────────────────

function LandingRateBadge({ rate }: { rate: number }) {
  if (rate >= 95) return <Badge tone="go">{rate.toFixed(1)}%</Badge>;
  if (rate >= 85) return <Badge tone="warning">{rate.toFixed(1)}%</Badge>;
  return <Badge tone="warning">{rate.toFixed(1)}%</Badge>;
}

// ── Global landing rate hero ───────────────────────────────────────────────────

function GlobalLandingRate({ rate, total, landed }: { rate: number; total: number; landed: number }) {
  return (
    <div className="boosters-global-rate">
      <div className="boosters-global-rate__number">
        <span className="boosters-global-rate__value">{rate.toFixed(1)}%</span>
        <span className="boosters-global-rate__label">Taux d'atterrissage global</span>
      </div>
      <div className="boosters-global-rate__details">
        <span>{landed.toLocaleString('fr-FR')} atterrisages</span>
        <span>/</span>
        <span>{total.toLocaleString('fr-FR')} essais</span>
      </div>
    </div>
  );
}

// ── Boosters table ─────────────────────────────────────────────────────────────

function BoostersTable({ boosters }: { boosters: Booster[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('flights');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => sortBoosters(boosters, sortKey, sortDir), [boosters, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function headerClass(dir: SortDir | null) {
    return dir === 'asc' ? 'th--asc' : dir === 'desc' ? 'th--desc' : '';
  }

  return (
    <div className="boosters-table-wrap">
      <table className="boosters-table">
        <thead>
          <tr>
            <th className={`th-sortable ${headerClass(sortKey === 'serialNumber' ? sortDir : null)}`} onClick={() => toggleSort('serialNumber')}>
              <span className="th-content">
                Boosters
                <span className="th-sort-arrow">{sortKey === 'serialNumber' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
              </span>
            </th>
            <th className={`th-sortable ${headerClass(sortKey === 'flights' ? sortDir : null)}`} onClick={() => toggleSort('flights')}>
              <span className="th-content">
                Vol
                <span className="th-sort-arrow">{sortKey === 'flights' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
              </span>
            </th>
            <th className={`th-sortable ${headerClass(sortKey === 'landingRate' ? sortDir : null)}`} onClick={() => toggleSort('landingRate')}>
              <span className="th-content">
                Atterrissages
                <span className="th-sort-arrow">{sortKey === 'landingRate' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
              </span>
            </th>
            <th>Taux</th>
            <th>Statut</th>
            <th>Dernier vol</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => (
            <tr key={b.serialNumber}>
              <td className="td-serial">
                <span className="booster-serial">{b.serialNumber}</span>
                <span className="booster-type">{b.type}</span>
              </td>
              <td>{b.flights}</td>
              <td>
                <span className="landing-stats">
                  {b.landed}<span className="landing-divider">/</span>{b.attempted}
                </span>
              </td>
              <td>
                <LandingRateBadge rate={b.landingRate} />
              </td>
              <td>
                <Badge tone={b.status === 'active' ? 'go' : 'warning'}>
                  {b.status === 'active' ? 'Actif' : b.status === 'retired' ? 'Retiré' : 'Perdu'}
                </Badge>
              </td>
              <td className="td-last-flight">
                {b.lastFlight ? new Date(b.lastFlight).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Boosters Section ───────────────────────────────────────────────────────────

export function BoostersSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats'],
    queryFn: () => statsApi.getStats(),
    staleTime: 60_000,
    retry: 1,
  });

  const stats = data;
  const boosters = stats?.boosters?.list ?? [];

  if (isLoading) return <Loading />;
  if (error && !stats) return <ErrorState message="Impossible de charger les données des boosters." retry={() => statsApi.getStats()} />;
  if (!boosters.length) return <div className="empty">Aucune donnée de booster disponible.</div>;

  const globalRate = stats?.boosters?.landingRate ?? 0;
  const totalAttempts = stats?.boosters?.total ?? 0;
  const activeCount = stats?.boosters?.active ?? 0;
  const recordFlights = stats?.boosters?.recordFlights ?? 0;
  const recordBooster = stats?.boosters?.recordBooster ?? '';

  return (
    <section className="section">
      <SectionHeading
        index="05"
        eyebrow="Fusées réutilisables"
        title="Boosters"
        description={`${boosters.length} boosters trackés · ${activeCount} actifs · ${totalAttempts} essais d'atterrissage`}
      />

      {/* Global landing rate */}
      <div className="boosters-hero-row">
        <GlobalLandingRate rate={globalRate} total={totalAttempts} landed={boosters.reduce((s, b) => s + b.landed, 0)} />
        {recordFlights > 0 && (
          <div className="boosters-record">
            <span className="boosters-record__label">Record de vol</span>
            <span className="boosters-record__value">{recordFlights} vols</span>
            <span className="boosters-record__sub">Booster {recordBooster}</span>
          </div>
        )}
      </div>

      {/* Table */}
      <BoostersTable boosters={boosters} />
    </section>
  );
}
