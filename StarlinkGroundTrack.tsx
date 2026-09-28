import { useMemo } from 'react'
import type { StarlinkSummary } from './types'

const MAX_POINTS = 120

function latLonToPixel(
  latitude: number,
  longitude: number,
  width: number,
  height: number,
  margin: number,
): { x: number; y: number } {
  const plotWidth = width - 2 * margin
  const plotHeight = height - 2 * margin
  return {
    x: margin + ((longitude + 180) / 360) * plotWidth,
    y: margin + ((90 - latitude) / 180) * plotHeight,
  }
}

function inclinationColor(inclination: number): string {
  // Low inclination (LEO equatorial, ~0-20°): warm amber
  // Medium (20-50°): warm orange
  // High (50-70°): blue
  // Very high / polar (>70°): cyan
  if (inclination < 20) return '#ffc766'
  if (inclination < 50) return '#ff9f4a'
  if (inclination < 70) return '#69aaff'
  return '#5ce2a2'
}

function inclinationBandLabel(inclination: number): string {
  if (inclination < 20) return 'Faible inclinaison (0–20°)'
  if (inclination < 50) return 'Inclinaison modérée (20–50°)'
  if (inclination < 70) return 'Inclinaison élevée (50–70°)'
  return 'Inclinaison polaire (>70°)'
}

export function StarlinkGroundTrack({ data }: { data: StarlinkSummary }) {
  // Build a lookup map: noradId -> inclination
  const inclinationByNoradId = useMemo(() => {
    const map = new Map<number, number>()
    for (const sat of data.satellites) {
      map.set(sat.noradId, sat.inclination)
    }
    return map
  }, [data.satellites])

  const plottedPositions = useMemo(() => {
    if (data.positions.length <= MAX_POINTS) return data.positions
    // Stratified sample: spread evenly across the array
    const step = data.positions.length / MAX_POINTS
    const sampled: typeof data.positions = []
    for (let i = 0; i < MAX_POINTS; i++) {
      const idx = Math.floor(i * step)
      if (idx < data.positions.length) sampled.push(data.positions[idx])
    }
    return sampled
  }, [data.positions])

  const width = 720
  const height = 360
  const margin = 28

  // Grid lines: meridians every 30°, parallels every 30°
  const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]
  const parallels = [-60, -30, 0, 30, 60]

  return (
    <div className="ground-track">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="ground-track__svg"
        role="img"
        aria-label="Carte des positions satellites Starlink (projection latitude/longitude)"
      >
        {/* Fond océan */}
        <rect x={margin} y={margin} width={width - 2 * margin} height={height - 2 * margin} fill="#0a1a2e" rx="4" />

        {/* Grille de parallels (lignes horizontales) */}
        {parallels.map((lat) => {
          const p = latLonToPixel(lat, 0, width, height, margin)
          return (
            <line
              key={`parallel-${lat}`}
              x1={margin}
              y1={p.y}
              x2={width - margin}
              y2={p.y}
              stroke={lat === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}
              strokeWidth={lat === 0 ? 1 : 0.5}
              strokeDasharray={lat === 0 ? undefined : '3,3'}
            />
          )
        })}

        {/* Grille de meridians (lignes verticales) */}
        {meridians.map((lon) => {
          const p = latLonToPixel(0, lon, width, height, margin)
          return (
            <line
              key={`meridian-${lon}`}
              x1={p.x}
              y1={margin}
              x2={p.x}
              y2={height - margin}
              stroke={lon === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}
              strokeWidth={lon === 0 ? 1 : 0.5}
              strokeDasharray={lon === 0 ? undefined : '3,3'}
            />
          )
        })}

        {/* Étiquettes parallels */}
        {parallels.map((lat) => {
          const p = latLonToPixel(lat, 180, width, height, margin)
          return (
            <text
              key={`label-parallel-${lat}`}
              x={width - margin + 6}
              y={p.y}
              textAnchor="start"
              dominantBaseline="middle"
              fill={lat === 0 ? '#8b96a6' : '#5a6577'}
              fontSize="9"
              fontFamily="'Space Mono', monospace"
            >
              {lat}°
            </text>
          )
        })}

        {/* Étiquettes meridians */}
        {meridians.map((lon) => {
          const p = latLonToPixel(88, lon, width, height, margin)
          return (
            <text
              key={`label-meridian-${lon}`}
              x={p.x}
              y={margin - 8}
              textAnchor="middle"
              fill={lon === 0 ? '#8b96a6' : '#5a6577'}
              fontSize="9"
              fontFamily="'Space Mono', monospace"
            >
              {lon > 0 ? `/${lon}` : lon === 0 ? '0' : lon}
            </text>
          )
        })}

        {/* Points satellites */}
        {plottedPositions.map((pos) => {
          const p = latLonToPixel(pos.latitude, pos.longitude, width, height, margin)
          const inclination = inclinationByNoradId.get(pos.id) ?? data.averageInclination
          const color = inclinationColor(inclination)
          return (
            <g
              key={pos.id}
              className="ground-point"
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                const tooltip = e.currentTarget.querySelector('.ground-tooltip') as HTMLElement | null
                if (tooltip) {
                  tooltip.style.display = 'block'
                  e.currentTarget.querySelector('circle')?.setAttribute('r', '4')
                }
              }}
              onMouseLeave={(e) => {
                const tooltip = e.currentTarget.querySelector('.ground-tooltip') as HTMLElement | null
                if (tooltip) tooltip.style.display = 'none'
                e.currentTarget.querySelector('circle')?.setAttribute('r', '2.2')
              }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={2.2}
                fill={color}
                opacity={0.85}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth="0.5"
              />
              <text
                x={p.x + 5}
                y={p.y - 5}
                className="ground-tooltip"
                style={{ display: 'none', position: 'absolute', pointerEvents: 'none' }}
                fill="#f4f7fb"
                fontSize="10"
                fontFamily="'Space Mono', monospace"
                filter="url(#tooltip-shadow)"
              >
                {pos.name} · {pos.latitude.toFixed(1)}°, {pos.longitude.toFixed(1)}°
              </text>
            </g>
          )
        })}

        {/* Dégradé de shadow pour tooltips */}
        <defs>
          <filter id="tooltip-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="1" stdDeviation="1.5" floodColor="black" floodOpacity="0.7" />
          </filter>
        </defs>
      </svg>

      <div className="ground-track__legend">
        <div className="legend-title">Légende des couleurs</div>
        <div className="legend-rows">
          {[
            { band: 'Faible inclinaison (0–20°)', color: '#ffc766' },
            { band: 'Inclinaison modérée (20–50°)', color: '#ff9f4a' },
            { band: 'Inclinaison élevée (50–70°)', color: '#69aaff' },
            { band: 'Inclinaison polaire (>70°)', color: '#5ce2a2' },
          ].map((item) => (
            <div key={item.band} className="legend-row">
              <span className="legend-swatch" style={{ background: item.color, border: `1px solid ${item.color}` }} />
              <span>{item.band}</span>
            </div>
          ))}
        </div>
        <p className="ground-track__disclaimer">
          ⚠️ Les positions sont des <strong>estimations calculées</strong> à partir des éléments orbitaux Space-Track, pas du télémétrie live.
          Elles ne tiennent pas compte des maneuvres des satellites ni des effets atmosphériques.
        </p>
      </div>
    </div>
  )
}
