import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { statsApi, FALLBACK_STATS } from './api';
import type { StatsData } from './types';

// ── Animated counter ──────────────────────────────────────────────────────────

function AnimatedCounter({ value, suffix = '', duration = 1200 }: {
  value: number;
  suffix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (startRef.current !== null) return;
    startRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
      else startRef.current = null;
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      startRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <>{display}{suffix}</>;
}

// ── Bar chart (SVG, no external deps) ─────────────────────────────────────────

function BarChart({
  data,
  color,
  yLabel,
  unit,
  max,
  height = 180,
}: {
  data: Array<{ year: number; launches: number }>;
  color: string;
  yLabel: string;
  unit?: string;
  max: number;
  height?: number;
}) {
  const padding = { top: 10, right: 16, bottom: 32, left: 44 };
  const barWidth = Math.max(4, (100 - padding.left - padding.right) / data.length - 4);
  const chartHeight = height - padding.top - padding.bottom;

  return (
    <div className="stat-chart">
      <svg
        className="stat-chart__svg"
        viewBox={`0 0 ${100} ${height}`}
        role="img"
        aria-label={`Graphique des lancements par année : ${data.map(d => `${d.year}: ${d.launches}`).join(', ')}`}
      >
        {/* grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={padding.left}
            y1={padding.top + chartHeight * (1 - frac)}
            x2={100 - padding.right}
            y2={padding.top + chartHeight * (1 - frac)}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
          />
        ))}
        {/* bars */}
        {data.map((d) => {
          const h = (d.launches / max) * chartHeight;
          const x = padding.left + (100 - padding.left - padding.right) * (d.year - data[0].year) / (data[data.length - 1].year - data[0].year) + (100 - padding.left - padding.right) / data.length * 0.15;
          const w = (100 - padding.left - padding.right) / data.length * 0.7;
          return (
            <g key={d.year}>
              <rect
                x={x}
                y={padding.top + chartHeight - h}
                width={w}
                height={h}
                fill={color}
                rx={1}
                className="stat-chart__bar"
              />
              <text
                x={x + w / 2}
                y={height - 8}
                textAnchor="middle"
                fill="rgba(255,255,255,0.35)"
                fontSize={3.5}
                fontFamily="'Space Mono', monospace"
              >
                {d.year}
              </text>
            </g>
          );
        })}
        {/* y-axis label */}
        <text
          x={10}
          y={padding.top + chartHeight / 2}
          fill="rgba(255,255,255,0.3)"
          fontSize={3.5}
          fontFamily="'Space Mono', monospace"
          transform={`rotate(-90 ${10} ${padding.top + chartHeight / 2})`}
          textAnchor="middle"
        >
          {yLabel}
        </text>
      </svg>
      <div className="stat-chart__tooltip" />
    </div>
  );
}

// ── Landing sites horizontal bar ───────────────────────────────────────────────

function LandingSitesChart({ data }: { data: Array<{ site: string; landings: number; rate: number }> }) {
  const max = Math.max(...data.map(d => d.landings));
  const chartHeight = 160;
  const rowHeight = chartHeight / data.length;

  return (
    <div className="stat-chart stat-chart--sites">
      <svg
        viewBox={`0 0 100 100`}
        role="img"
        aria-label="Graphique des sites d'atterrissage par nombre d'atterissages"
      >
        {data.map((d, i) => {
          const barWidth = (d.landings / max) * 65;
          const y = 8 + i * (100 - 16) / data.length;
          return (
            <g key={d.site}>
              <text
                x={2}
                y={y + 5}
                fill="rgba(255,255,255,0.5)"
                fontSize={4}
                fontFamily="'Space Mono', monospace"
              >
                {d.site}
              </text>
              <rect
                x={20}
                y={y}
                width={barWidth}
                height={6}
                fill="url(#siteGrad)"
                rx={1}
                className="stat-chart__bar"
              />
              <text
                x={20 + barWidth + 3}
                y={y + 5}
                fill="rgba(255,255,255,0.45)"
                fontSize={3.5}
                fontFamily="'Space Mono', monospace"
              >
                {d.landings} ({d.rate}%)
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
  sublabel,
  color,
}: {
  label: string;
  value: number;
  suffix?: string;
  sublabel?: string;
  color: string;
}) {
  return (
    <article className="stat-card">
      <span className="stat-card__label" style={{ color }}>{label}</span>
      <div className="stat-card__value" style={{ color }}>
        <AnimatedCounter value={value} suffix={suffix} />
      </div>
      {sublabel && <span className="stat-card__sub">{sublabel}</span>}
    </article>
  );
}

// ── Main Stats Dashboard ───────────────────────────────────────────────────────

export function StatsDashboard() {
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: statsApi.getStats,
    staleTime: 600_000,
    retry: 1,
  });

  const data = stats.data ?? FALLBACK_STATS;
  const cadence = data.launchCadence;
  const maxYear = Math.max(...data.launchesPerYear.map(d => d.launches));

  return (
    <section className="section" id="stats">
      <div className="section-heading">
        <div className="section-index">05</div>
        <div>
          <p className="eyebrow">Statistiques dynamiques</p>
          <h2>Performance SpaceX</h2>
          <p>
            {stats.isPending
              ? 'Chargement des statistiques…'
              : stats.isError
                ? `API unavailable: ${stats.error.message}`
                : `Données mises à jour depuis l'API The Space Devs. ${cadence.total} lancements au total.`}
          </p>
        </div>
      </div>

      {stats.isPending ? (
        <div className="loading-grid">
          <div className="loading-card"><i /><i /><i /></div>
          <div className="loading-card"><i /><i /></div>
        </div>
      ) : stats.isError ? (
        <div className="error-state">
          <span>!</span>
          <p>{stats.error.message}</p>
        </div>
      ) : (
        <>
          {/* ── Animated counters ── */}
          <div className="stats-counters">
            <StatCard
              label="Lancements totaux"
              value={cadence.total}
              sublabel="Depuis 2010"
              color="var(--blue)"
            />
            <StatCard
              label="Taux de réussite"
              value={cadence.successRate}
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
              sublabel={`sur ${new Date().getFullYear()}`}
              color="#c5a0ff"
            />
          </div>

          {/* ── Charts row ── */}
          <div className="stats-charts">
            <div className="stat-chart-panel">
              <p className="panel-label">Lancements par année</p>
              <BarChart
                data={data.launchesPerYear}
                color="var(--blue)"
                yLabel="Lancements"
                max={maxYear}
              />
            </div>
            <div className="stat-chart-panel">
              <p className="panel-label">Sites d'atterrissage · atterissages réussis</p>
              <LandingSitesChart data={data.landingSites} />
            </div>
          </div>

          {/* ── Boosters mini-card ── */}
          <div className="stats-boosters">
            <div className="stat-boosters__card">
              <span className="stat-boosters__label">Boosters actifs</span>
              <span className="stat-boosters__value" style={{ color: 'var(--green)' }}>
                {data.boosters.active}
                <small>/{data.boosters.total} construits</small>
              </span>
            </div>
            <div className="stat-boosters__card">
              <span className="stat-boosters__label">Taux d'atterrissage</span>
              <span className="stat-boosters__value" style={{ color: 'var(--amber)' }}>
                {data.boosters.landingRate}
                <small>%</small>
              </span>
            </div>
            <div className="stat-boosters__card">
              <span className="stat-boosters__label">Record de vol</span>
              <span className="stat-boosters__value" style={{ color: 'var(--blue)' }}>
                {data.boosters.recordFlights}
                <small>vol · {data.boosters.recordBooster}</small>
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
