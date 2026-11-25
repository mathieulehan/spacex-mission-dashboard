import { useState, useMemo, type KeyboardEvent } from 'react';
import { useStatsQuery } from './useStatsQuery';
import { SectionHeading } from './components';
import { Badge } from './components';
import { Loading } from './components';
import { ErrorState } from './components';
import type { Booster } from './types';

// ── Sorting helpers ────────────────────────────────────────────────────────────

type SortKey = 'serialNumber' | 'flights' | 'landed';
type SortDir = 'asc' | 'desc';

/** 10 lignes par page : le roster complet (87 boosters) reste parcourable. */
const PAGE_SIZE = 10;

function sortBoosters(boosters: Booster[], key: SortKey, dir: SortDir): Booster[] {
  const sorted = [...boosters];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (key === 'serialNumber') {
      cmp = a.serialNumber.localeCompare(b.serialNumber);
    } else if (key === 'flights') {
      cmp = a.flights - b.flights;
    } else {
      // "Atterrissages" se trie par nombre de réussites, pas par taux.
      cmp = a.landed - b.landed;
    }
    return dir === 'desc' ? -cmp : cmp;
  });
  return sorted;
}

function ariaSort(active: boolean, dir: SortDir): 'none' | 'ascending' | 'descending' {
  if (!active) return 'none';
  return dir === 'asc' ? 'ascending' : 'descending';
}

function onSortKeyDown(toggle: () => void) {
  return (event: KeyboardEvent<HTMLTableCellElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  };
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
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => sortBoosters(boosters, sortKey, sortDir), [boosters, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // Un refetch peut réduire l'effectif : on borne l'index sans état asynchrone.
  const currentPage = Math.min(page, totalPages);
  const pageBoosters = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    // Un nouveau tri reprend toujours au début du classement.
    setPage(1);
  }

  function headerClass(key: SortKey) {
    return sortKey === key ? headerClassFromDir(sortDir) : '';
  }

  function headerClassFromDir(dir: SortDir) {
    return dir === 'asc' ? 'th--asc' : 'th--desc';
  }

  function sortableHeader(key: SortKey, label: string) {
    return (
      <th
        scope="col"
        className={`th-sortable ${headerClass(key)}`}
        aria-sort={ariaSort(sortKey === key, sortDir)}
        tabIndex={0}
        onClick={() => toggleSort(key)}
        onKeyDown={onSortKeyDown(() => toggleSort(key))}
      >
        <span className="th-content">
          {label}
          <span className="th-sort-arrow">{sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
        </span>
      </th>
    );
  }

  return (
    <div className="boosters-table-wrap">
      <table className="boosters-table">
        <thead>
          <tr>
            {sortableHeader('serialNumber', 'Boosters')}
            {sortableHeader('flights', 'Vol')}
            {sortableHeader('landed', 'Atterrissages')}
            <th scope="col">Statut</th>
            <th scope="col">Dernier vol</th>
          </tr>
        </thead>
        <tbody>
          {pageBoosters.map((b) => (
            <tr key={b.serialNumber}>
              <td className="td-serial" data-label="Booster">
                <span className="booster-identity">
                  <span className="booster-serial">{b.serialNumber}</span>
                  <span className="booster-type">{b.type}</span>
                </span>
              </td>
              <td data-label="Vols">{b.flights}</td>
              <td data-label="Atterrissages">
                <span className="landing-stats">
                  {b.landed}<span className="landing-divider">/</span>{b.attempted}
                </span>
              </td>
              <td data-label="Statut">
                <Badge tone={b.status === 'active' ? 'go' : 'warning'}>
                  {b.status === 'active' ? 'Actif' : b.status === 'retired' ? 'Retiré' : 'Perdu'}
                </Badge>
              </td>
              <td className="td-last-flight" data-label="Dernier vol">
                {b.lastFlight ? new Date(b.lastFlight).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="boosters-pagination">
        <button
          type="button"
          className="boosters-page-button"
          aria-label="Page précédente"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
        >
          ← Précédent
        </button>
        <span className="boosters-page-indicator" aria-live="polite">
          Page {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          className="boosters-page-button"
          aria-label="Page suivante"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}

// ── Boosters Section ───────────────────────────────────────────────────────────

export function BoostersSection() {
  const { data, isLoading, error, refetch } = useStatsQuery();

  const stats = data;
  const boosters = stats?.boosters?.list ?? []  // StatsBooster.list existe;

  // Tant que le snapshot partagé n'est pas disponible, aucune section ne doit
  // afficher « aucune donnée » : ce serait un faux négatif pendant le chargement.
  if (isLoading || (!stats && !error)) return <Loading />;
  if (error && !stats) return <ErrorState message="Impossible de charger les données des boosters." retry={refetch} />;
  if (!boosters.length) return <div className="empty">Le détail par booster n’est pas fourni par la source actuelle ; les agrégats sont dans la section Performance SpaceX.</div>;

  const globalRate = stats?.boosters?.landingRate ?? 0;
  // `total` est normalisé depuis `totalAttempts` ; lire la source explicite évite
  // toute ambiguïté avec un ancien champ « total construits » jamais fourni.
  const totalAttempts = stats?.boosters?.totalAttempts ?? 0;
  const activeCount = stats?.boosters?.active ?? 0;
  const recordFlights = stats?.boosters?.recordFlights ?? 0;
  const recordBooster = stats?.boosters?.recordBooster ?? '';

  return (
    <section className="section" id="boosters">
      <SectionHeading
        index="05"
        eyebrow="Fusées réutilisables"
        title="Boosters"
        description={`${boosters.length} boosters trackés · ${activeCount} actifs · ${totalAttempts} essais d'atterrissage`}
      />

      {/* Global landing rate */}
      <div className="boosters-hero-row">
        <GlobalLandingRate rate={globalRate} total={totalAttempts} landed={boosters.reduce((s: number, b: { landed: number }) => s + b.landed, 0)} />
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
