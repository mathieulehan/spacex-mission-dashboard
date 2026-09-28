import { useMemo } from 'react'
import type { StarlinkSummary } from './types'

const BIN_DEGREES = 30
const NUM_BINS = 360 / BIN_DEGREES

function raanToBin(raan: number): number {
  const normalized = ((raan % 360) + 360) % 360
  return Math.floor(normalized / BIN_DEGREES) % NUM_BINS
}

export function StarlinkPolarPlot({ data }: { data: StarlinkSummary }) {
  const bins = useMemo(() => {
    const counts = new Array<number>(NUM_BINS).fill(0)
    for (const point of data.plot) {
      counts[raanToBin(point.raan)]++
    }
    return counts
  }, [data.plot])

  const maxCount = Math.max(...bins, 1)

  const centerX = 180
  const centerY = 190
  const innerRadius = 55
  const outerRadius = 155

  const angleForBin = (binIndex: number) => {
    const startAngle = (binIndex * BIN_DEGREES - 90) * (Math.PI / 180)
    const endAngle = ((binIndex + 1) * BIN_DEGREES - 90) * (Math.PI / 180)
    return { startAngle, endAngle }
  }

  const radiusForCount = (count: number) => {
    const fraction = count / maxCount
    return innerRadius + fraction * (outerRadius - innerRadius)
  }

  const polarToCartesian = (angleRad: number, radius: number) => {
    return {
      x: centerX + radius * Math.cos(angleRad),
      y: centerY + radius * Math.sin(angleRad),
    }
  }

  const describeArc = (binIndex: number, count: number) => {
    const { startAngle, endAngle } = angleForBin(binIndex)
    const r = radiusForCount(count)
    const start = polarToCartesian(startAngle, innerRadius)
    const end = polarToCartesian(endAngle, innerRadius)
    const startOuter = polarToCartesian(startAngle, r)
    const endOuter = polarToCartesian(endAngle, r)
    const largeArc = BIN_DEGREES > 180 ? 1 : 0

    if (count === 0) return ''

    return [
      `M ${start.x} ${start.y}`,
      `L ${startOuter.x} ${startOuter.y}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
      `L ${end.x} ${end.y}`,
      'Z',
    ].join(' ')
  }

  const tickAngles = [0, 90, 180, 270]
  const tickLabels = ['0°', '90°', '180°', '270°']

  return (
    <div className="polar-plot">
      <svg
        viewBox="0 0 360 390"
        className="polar-plot__svg"
        role="img"
        aria-label="Histogramme polaire de la répartition des satellites Starlink par angle RAAN"
      >
        {/* Grille radiale */}
        {[0.25, 0.5, 0.75].map((fraction) => {
          const r = innerRadius + fraction * (outerRadius - innerRadius)
          const points: string[] = []
          for (let i = 0; i <= 360; i += 2) {
            const a = (i - 90) * (Math.PI / 180)
            points.push(`${centerX + r * Math.cos(a)},${centerY + r * Math.sin(a)}`)
          }
          return (
            <polyline
              key={fraction}
              points={points.join(' ')}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          )
        })}

        {/* Axes de graduation */}
        {tickAngles.map((angle, i) => {
          const rad = (angle - 90) * (Math.PI / 180)
          const x2 = centerX + (outerRadius + 25) * Math.cos(rad)
          const y2 = centerY + (outerRadius + 25) * Math.sin(rad)
          return (
            <g key={angle}>
              <line
                x1={centerX + (outerRadius + 10) * Math.cos(rad)}
                y1={centerY + (outerRadius + 10) * Math.sin(rad)}
                x2={x2}
                y2={y2}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="1"
              />
              <text
                x={x2}
                y={y2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#8b96a6"
                fontSize="11"
                fontFamily="'Space Mono', monospace"
              >
                {tickLabels[i]}
              </text>
            </g>
          )
        })}

        {/* Anneaux de grille avec étiquettes radiales */}
        <text
          x={centerX + innerRadius}
          y={centerY}
          textAnchor="start"
          dominantBaseline="middle"
          fill="#8b96a6"
          fontSize="9"
          fontFamily="'Space Mono', monospace"
          transform={`rotate(0, ${centerX + innerRadius}, ${centerY})`}
        >
          0
        </text>
        <text
          x={centerX}
          y={centerY - innerRadius}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#8b96a6"
          fontSize="9"
          fontFamily="'Space Mono', monospace"
        >
          {Math.round((maxCount / 2) / 50) * 50}
        </text>
        <text
          x={centerX - innerRadius}
          y={centerY}
          textAnchor="end"
          dominantBaseline="middle"
          fill="#8b96a6"
          fontSize="9"
          fontFamily="'Space Mono', monospace"
        >
          {maxCount}
        </text>

        {/* Barres */}
        {bins.map((count, binIndex) => {
          const path = describeArc(binIndex, count)
          if (!path) return null
          const midAngle = ((binIndex + 0.5) * BIN_DEGREES - 90) * (Math.PI / 180)
          const midRadius = radiusForCount(count)
          const tip = polarToCartesian(midAngle, midRadius)
          return (
            <g key={binIndex} className="polar-bar">
              <path
                d={path}
                fill="rgba(105,170,255,0.7)"
                stroke="rgba(105,170,255,0.9)"
                strokeWidth="0.5"
                style={{
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1'
                  const tooltip = e.currentTarget.querySelector('.polar-tooltip') as HTMLElement | null
                  if (tooltip) tooltip.style.display = 'block'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.85'
                  const tooltip = e.currentTarget.querySelector('.polar-tooltip') as HTMLElement | null
                  if (tooltip) tooltip.style.display = 'none'
                }}
              />
              <text
                x={tip.x}
                y={tip.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(244,247,251,0.85)"
                fontSize="9"
                fontFamily="'Space Mono', monospace"
                className="polar-tooltip"
                style={{ display: 'none' }}
                pointerEvents="none"
              >
                {count} sat.
              </text>
            </g>
          )
        })}

        {/* Cercle central */}
        <circle cx={centerX} cy={centerY} r={innerRadius - 2} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {/* Titre axes */}
        <text
          x={centerX}
          y={370}
          textAnchor="middle"
          fill="#596577"
          fontSize="9"
          fontFamily="'Space Mono', monospace"
          letterSpacing="1"
        >
          RAAN (°)
        </text>
      </svg>

      <div className="polar-plot__legend">
        <div className="legend-row">
          <span className="legend-swatch" style={{ background: 'rgba(105,170,255,0.7)', border: '1px solid rgba(105,170,255,0.9)' }} />
          <span>Chaque barre = nombre de satellites dans un intervalle de 30° de RAAN</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch legend-peak" />
          <span>Un pic = un <strong>cluster de plan orbital</strong> (satellites partant dans la même direction)</span>
        </div>
      </div>
    </div>
  )
}
