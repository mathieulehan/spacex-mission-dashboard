import { useEffect, useId, useRef, useState } from 'react';
import { FALLBACK_STATS } from './api';
import { formatSnapshotDate, statsSourceLabel } from './statsContract';
import { useStatsQuery } from './useStatsQuery';

// Au-delà de ce délai sans réponse, on affiche le snapshot daté plutôt que
// de laisser un loading sans fin (cold start Render + retries React Query).
const LOADING_TIMEOUT_MS = 9_000;

// ── Valeurs factuelles (sans animation numérique) ────────────────────────────
// Un compteur qui « monte » affiche pendant ~1,2 s des chiffres qui ne
// correspondent à aucune donnée (ex. 58,05 % alors que l'API dit 98,34 %).
// Ces valeurs sont des faits : la valeur définitive est rendue dès le premier
// rendu, sans état intermédiaire. Invariant : valeur affichée == /api/stats.
// Conséquence : prefers-reduced-motion est respecté par construction
// (aucune animation JS à désactiver ; le CSS ci-dessous couvre le décoratif).

const numberFormatters = new Map<number, Intl.NumberFormat>();

/** Formate en fr-FR : virgule décimale et séparateur de milliers. */
function formatStatNumber(value: number, decimals: number): string {
  // Dernière ligne de défense : jamais de NaN / Infinity dans le DOM.
  if (!Number.isFinite(value)) return '—';
  let formatter = numberFormatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    numberFormatters.set(decimals, formatter);
  }
  return formatter.format(value);
}

// Les taux sont affichés avec 2 décimales ; les volumes restent entiers.
const formatRate = (rate: number) => formatStatNumber(rate, 2);

function StatValue({
  value,
  suffix = '',
  decimals = 0,
  color,
  describedBy,
}: {
  value: number;
  suffix?: string;
  /** 0 pour les volumes entiers, 2 pour les taux. */
  decimals?: number;
  color: string;
  /** Id du sous-label, pour annoncer valeur ET contexte en une seule passe. */
  describedBy?: string;
}) {
  // `aria-live` porte sur la seule valeur définitive : elle est annoncée une
  // fois aux lecteurs d'écran, et `aria-atomic` garantit l'annonce complète.
  // Le sous-label est relié par `aria-describedby` (id unique généré par
  // useId dans StatCard) : « 98,34 % — 709 sur 721 missions » et non un
  // chiffre orphelin. Aucun état transitoire n'entre dans cette région.
  return (
    <div
      className="stat-card__value"
      style={{ color }}
      aria-live="polite"
      aria-atomic="true"
      aria-describedby={describedBy}
    >
      {formatStatNumber(value, decimals)}{suffix}
    </div>
  );
}

// ── Responsive SVG scaffolding ─────────────────────────────────────────────────
// Un viewBox fixe (ex. 0 0 100 180) étiré sur toute la largeur rend la hauteur
// proportionnelle au viewport et met à l'échelle les libellés (43 px sur PC,
// 13 px sur mobile). On cale donc le viewBox sur la taille réelle du conteneur :
// 1 unité SVG = 1 px CSS, quelles que soient la largeur et la hauteur imposées.

type ChartSize = { width: number; height: number };

function useChartSize(fallback: ChartSize) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ChartSize>(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const next = { width: Math.round(width), height: Math.round(height) };
      if (next.width > 0 && next.height > 0) {
        setSize(prev => (prev.width === next.width && prev.height === next.height ? prev : next));
      }
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return <div className="stat-chart__empty" role="status">{children}</div>;
}

/** Dernière ligne de défense : aucune valeur non finie n'atteint un attribut SVG. */
function safeValue(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function sumMax(values: number[]): number {
  return Math.max(1, ...values.map(safeValue));
}

// ── Bar chart (SVG, no external deps) ─────────────────────────────────────────

function BarChart({
  data,
  color,
  yLabel,
  max,
  height = 220,
}: {
  data: Array<{ year: number; launches: number }>;
  color: string;
  yLabel: string;
  max: number;
  height?: number;
}) {
  // Hooks toujours avant le retour « vide » : l'id sert de cible à aria-describedby
  // et reste stable pour une même instance de graphique.
  const descId = useId();
  const { ref, size } = useChartSize({ width: 400, height });
  const plot = { left: 46, right: 12, top: 14, bottom: 30 };
  const plotWidth = Math.max(1, size.width - plot.left - plot.right);
  const plotHeight = Math.max(1, size.height - plot.top - plot.bottom);
  // `Math.max(...[])` vaut -Infinity : un tableau vide doit donner un max sûr.
  const top = Number.isFinite(max) && max > 0 ? max : sumMax(data.map(d => d.launches));
  const slot = plotWidth / Math.max(data.length, 1);
  const barWidth = Math.max(2, slot * 0.62);

  if (!data.length) {
    return (
      <div className="stat-chart" ref={ref}>
        <ChartEmpty>Aucun lancement par année disponible</ChartEmpty>
      </div>
    );
  }

  const first = data[0];
  const last = data[data.length - 1];
  // Nom court : l'énumération de toutes les valeurs dans `aria-label`
  // produisait un attribut illisible. Le détail reste dans <desc>.
  const label = `Lancements par année de ${first.year} à ${last.year}`;
  const title = `Lancements par année — ${data.length} années, de ${first.year} à ${last.year}`;
  const description = `Lancements par année : ${data.map(d => `${d.year} : ${formatStatNumber(safeValue(d.launches), 0)}`).join(' ; ')}.`;

  return (
    <div className="stat-chart" ref={ref}>
      <svg
        className="stat-chart__svg"
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label={label}
        aria-describedby={descId}
      >
        <title>{title}</title>
        <desc id={descId}>{description}</desc>
        {/* Grille + graduations : les valeurs sont en fr-FR, jamais en unités de viewBox. */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = plot.top + plotHeight * (1 - frac);
          return (
            <g key={frac}>
              <line
                x1={plot.left}
                y1={y}
                x2={size.width - plot.right}
                y2={y}
                stroke="rgba(255,255,255,0.09)"
                strokeWidth={1}
              />
              <text
                x={plot.left - 8}
                y={y + 4}
                textAnchor="end"
                fill="rgba(255,255,255,0.45)"
                fontSize={11}
                fontFamily="'Space Mono', monospace"
              >
                {formatStatNumber(Math.round(top * frac), 0)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const value = safeValue(d.launches);
          const h = Math.max(0, (value / top) * plotHeight);
          // Position par index : pas de division par zéro avec une seule année.
          const x = plot.left + i * slot + (slot - barWidth) / 2;
          return (
            <g key={`${d.year}-${i}`}>
              <rect
                x={x}
                y={plot.top + plotHeight - h}
                width={barWidth}
                height={h}
                fill={color}
                rx={2}
                className="stat-chart__bar"
              >
                <title>{`${d.year} : ${formatStatNumber(value, 0)} lancements`}</title>
              </rect>
              {/* 16 années : un libellé sur deux reste lisible à 11 px. */}
              {(data.length <= 8 || i % 2 === 0) && (
                <text
                  x={x + barWidth / 2}
                  y={size.height - 9}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.55)"
                  fontSize={11}
                  fontFamily="'Space Mono', monospace"
                >
                  {d.year}
                </text>
              )}
            </g>
          );
        })}
        <text
          x={12}
          y={plot.top + plotHeight / 2}
          fill="rgba(255,255,255,0.4)"
          fontSize={11}
          fontFamily="'Space Mono', monospace"
          transform={`rotate(-90 12 ${plot.top + plotHeight / 2})`}
          textAnchor="middle"
        >
          {yLabel}
        </text>
      </svg>
    </div>
  );
}

// ── Landing sites horizontal bar ───────────────────────────────────────────────

function LandingSitesChart({ data }: { data: Array<{ site: string; landings: number; rate: number }> }) {
  const descId = useId();
  const { ref, size } = useChartSize({ width: 400, height: 180 });
  const padding = { top: 10, right: 10, bottom: 10, left: 8 };
  const labelWidth = Math.min(72, Math.max(48, size.width * 0.18));
  const valueWidth = 92;
  const barLeft = padding.left + labelWidth + 8;
  const barArea = Math.max(20, size.width - barLeft - valueWidth - padding.right);
  const rowHeight = Math.max(12, (size.height - padding.top - padding.bottom) / Math.max(data.length, 1));
  const max = sumMax(data.map(d => d.landings));
  // Ordre décroissant : le site le plus actif en haut, comme les autres graphiques.
  const sites = [...data].sort((a, b) => safeValue(b.landings) - safeValue(a.landings));

  if (!data.length) {
    return (
      <div className="stat-chart stat-chart--sites" ref={ref}>
        <ChartEmpty>Aucun site d'atterrissage disponible</ChartEmpty>
      </div>
    );
  }

  return (
    <div className="stat-chart stat-chart--sites" ref={ref}>
      <svg
        className="stat-chart__svg"
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label={`Sites d'atterrissage · ${sites.length} sites`}
        aria-describedby={descId}
      >
        <title>{`Sites d'atterrissage — ${sites.length} sites, atterrissages réussis`}</title>
        <desc id={descId}>
          {`Atterrissages réussis par site : ${sites.map(d => `${d.site} : ${formatStatNumber(safeValue(d.landings), 0)} (${formatRate(safeValue(d.rate))} %)`).join(' ; ')}.`}
        </desc>
        {sites.map((d, i) => {
          const landings = safeValue(d.landings);
          const rate = safeValue(d.rate);
          const width = (landings / max) * barArea;
          const y = padding.top + i * rowHeight;
          const barHeight = Math.min(10, Math.max(4, rowHeight * 0.45));
          return (
            <g key={`${d.site}-${i}`}>
              <text
                x={padding.left}
                y={y + rowHeight / 2 + 4}
                fill="rgba(255,255,255,0.65)"
                fontSize={11}
                fontFamily="'Space Mono', monospace"
              >
                {d.site}
              </text>
              <rect
                x={barLeft}
                y={y + (rowHeight - barHeight) / 2}
                width={width}
                height={barHeight}
                fill="url(#siteGrad)"
                rx={2}
                className="stat-chart__bar"
              >
                <title>{`${d.site} : ${formatStatNumber(landings, 0)} atterrissages (${formatRate(rate)} %)`}</title>
              </rect>
              <text
                x={barLeft + barArea + 8}
                y={y + rowHeight / 2 + 4}
                fill="rgba(255,255,255,0.55)"
                fontSize={11}
                fontFamily="'Space Mono', monospace"
              >
                {formatStatNumber(landings, 0)} ({formatRate(rate)}%)
              </text>
            </g>
          );
        })}
        <defs>
          <linearGradient id="siteGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#69aaff" />
            <stop offset="100%" stopColor="#5ce2a2" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  suffix,
  decimals = 0,
  sublabel,
  color,
}: {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  sublabel?: string;
  color: string;
}) {
  // React 19 génère un id unique par instance : deux dashboards (ou deux
  // rendus de test) ne peuvent pas se voler leur cible aria-describedby.
  const sublabelId = useId();
  return (
    <article className="stat-card">
      <span className="stat-card__label" style={{ color }}>{label}</span>
      <StatValue
        value={value}
        suffix={suffix}
        decimals={decimals}
        color={color}
        describedBy={sublabel ? sublabelId : undefined}
      />
      {sublabel && <span className="stat-card__sub" id={sublabelId}>{sublabel}</span>}
    </article>
  );
}

// ── Main Stats Dashboard ───────────────────────────────────────────────────────

export function StatsDashboard() {
  const stats = useStatsQuery();
  const [showFallback, setShowFallback] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Un loading qui n'aboutit pas n'est pas actionnable : au-delà du délai, on
  // bascule sur le snapshot daté. Le timer est nettoyé dès que la requête
  // quitte l'état « pending » (succès ou erreur définitive).
  useEffect(() => {
    if (!stats.isPending) return;
    const timer = window.setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [stats.isPending]);

  // Dès que des données en direct arrivent, on repasse en mode live et on
  // oublie les états de secours choisis par l'utilisateur.
  useEffect(() => {
    if (!stats.isSuccess) return;
    setTimedOut(false);
    setShowFallback(false);
  }, [stats.isSuccess]);

  const useFallback = timedOut || showFallback;
  // Un timeout déjà affiché reste stable même si la requête échoue ensuite :
  // l'utilisateur voit des chiffres datés, pas un écran qui clignote.
  const view = useFallback
    ? 'fallback'
    : stats.isError
      ? 'error'
      : stats.isPending
        ? 'loading'
        : 'live';

  const data = stats.data ?? FALLBACK_STATS;
  // La date affichée est toujours celle du snapshot réellement rendu : en cas
  // de refetch en échec, le cache peut contenir un instantané plus récent.
  const fallbackSourceDate = formatSnapshotDate(data.fetchedAt);
  const cadence = data.launchCadence;
  // normalizeStats() a déjà converti `landed` → `landings` : une seule forme canonique.
  const landingSites = data.landingSites;
  const yearly = [...(cadence.launchesPerYear ?? [])].sort((a, b) => a.year - b.year);
  // `Math.max(...[])` vaut -Infinity : borne basse à 1, même sans données.
  const maxYear = Math.max(1, ...yearly.map(d => d.completed ?? d.planned ?? 0));
  // Objectif annuel : « 130 / 145 (89,66 %) » — le taux vient du contrat, pas
  // d'un recalcul approximatif, et reste formaté en fr-FR comme les autres.
  const goal = cadence.launchGoal2026;
  const goalLabel = goal && goal.planned > 0
    ? `${formatStatNumber(goal.completed, 0)} / ${formatStatNumber(goal.planned, 0)} (${formatRate(goal.rate)} %)`
    : `sur ${new Date().getFullYear()}`;

  const description =
    view === 'loading'
      ? 'Chargement des statistiques…'
      : view === 'error'
        ? 'Impossible de charger les statistiques.'
        : view === 'fallback'
          ? `${statsSourceLabel(data)} Données en direct indisponibles.`
          : statsSourceLabel(data);

  return (
    <section className="section" id="stats" aria-busy={view === 'loading' ? 'true' : undefined}>
      <div className="section-heading">
        <div className="section-index">05</div>
        <div>
          <p className="eyebrow">Statistiques dynamiques</p>
          <h2>Performance SpaceX</h2>
          <p role="status" aria-live="polite">{description}</p>
        </div>
      </div>

      {view === 'loading' ? (
        // Squelette calqué sur la grille définitive : 4 cartes KPI + 2 panneaux.
        // Le message est porté par la région live du titre, pas par un doublon.
        <div className="stats-loading">
          <div className="stats-counters" aria-hidden="true">
            {[0, 1, 2, 3].map(i => (
              <div className="loading-card loading-card--kpi" key={i}><i /><i /><i /></div>
            ))}
          </div>
          <div className="stats-charts" aria-hidden="true">
            {[0, 1].map(i => (
              <div className="loading-card loading-card--panel" key={i}><i /><i /><i /><i /></div>
            ))}
          </div>
        </div>
      ) : view === 'error' ? (
        // Aucun message technique ni anglais exposé : le libellé reste court
        // et actionnable, le détail brut n'atteint jamais le DOM.
        <div className="error-state" role="alert">
          <span aria-hidden="true">!</span>
          <div>
            <strong>Impossible de charger les statistiques</strong>
            <p>
              Les données n’ont pas pu être récupérées. Réessayez ou consultez le dernier
              instantané connu du {fallbackSourceDate}.
            </p>
          </div>
          <div className="error-state__actions">
            <button type="button" onClick={() => stats.refetch()}>Réessayer</button>
            <button type="button" onClick={() => setShowFallback(true)}>
              Voir le dernier instantané connu
            </button>
          </div>
        </div>
      ) : (
        <>
          {view === 'fallback' && (
            <div className="stats-fallback-notice" role="status">
              <strong>Instantané de secours du {fallbackSourceDate}</strong>
              <span>
                {timedOut
                  ? 'Le chargement des données en direct a dépassé le délai imparti.'
                  : 'Les données en direct sont momentanément indisponibles.'}
              </span>
              <button type="button" onClick={() => stats.refetch()}>Réessayer</button>
            </div>
          )}
          {/* ── Animated counters ── */}
          <div className="stats-counters">
            <StatCard
              label="Lancements totaux"
              value={cadence.total}
              sublabel="Depuis 2006 — tous véhicules"
              color="var(--blue)"
            />
            <StatCard
              label="Taux de réussite"
              value={cadence.successRate}
              decimals={2}
              suffix="%"
              sublabel={`${cadence.successful} sur ${cadence.total} missions`}
              color="var(--green)"
            />
            <StatCard
              label="Réussites consécutives"
              value={cadence.consecutive}
              sublabel="Record actuel"
              color="var(--amber)"
            />
            <StatCard
              label="Lancements cette année"
              value={cadence.thisYear}
              sublabel={goalLabel}
              color="#c5a0ff"
            />
          </div>

          {/* ── Charts row ── */}
          <div className="stats-charts">
            <div className="stat-chart-panel">
              <p className="panel-label">Lancements par année</p>
              <BarChart
                data={yearly.map(d => ({ year: d.year, launches: d.completed ?? d.planned ?? 0 }))}
                color="var(--blue)"
                yLabel="Lancements"
                max={maxYear}
              />
            </div>
            <div className="stat-chart-panel">
              <p className="panel-label">Sites d'atterrissage · atterrissages réussis</p>
              <LandingSitesChart data={landingSites} />
            </div>
          </div>

          {/* ── Boosters mini-card ── */}
          <div className="stats-boosters">
            <div className="stat-boosters__card">
              {/* `active`/`total` (construits) n'existent pas dans la source :
                  on affiche des agrégats réellement renvoyés par l'API. */}
              <span className="stat-boosters__label">Atterrissages réussis</span>
              <span className="stat-boosters__value" style={{ color: 'var(--green)' }}>
                {data.boosters.totalLanded}
                <small>/{data.boosters.totalAttempts} tentatives</small>
              </span>
            </div>
            <div className="stat-boosters__card">
              <span className="stat-boosters__label">Taux d'atterrissage</span>
              <span className="stat-boosters__value" style={{ color: 'var(--amber)' }}>
                {formatRate(data.boosters.landingRate)}
                <small>%</small>
              </span>
            </div>
            <div className="stat-boosters__card">
              <span className="stat-boosters__label">Record de vol</span>
              <span className="stat-boosters__value" style={{ color: 'var(--blue)' }}>
                {data.boosters.recordFlights}
                <small> vols · {data.boosters.recordBooster}</small>
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
