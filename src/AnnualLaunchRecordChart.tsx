import React, { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { StatsLaunchCadence } from './types'

echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  CanvasRenderer,
])

function AnnualLaunchRecordChart({ cadence }: { cadence: StatsLaunchCadence }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    const years = cadence.launchesPerYear.slice(0, 8).reverse()
    const yearsLabel = years.map((y) => String(y.year))
    const completedData = years.map((y) => y.completed)
    const failedData = years.map((y) => y.planned - y.completed)

    // Fondu gradient pour les barres complétées (vertespacex)
    const option: any = {
      title: {
        text: 'Annual Launch Record',
        left: 'left',
        textStyle: {
          color: '#9ca3af',
          fontSize: 12,
          fontFamily: 'Space Mono, monospace',
        },
      },
      grid: {
        left: 40,
        right: 20,
        top: 30,
        bottom: 28,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(17,24,39,0.95)',
        borderColor: '#374151',
        textStyle: { color: '#f9fafb', fontFamily: 'Space Mono, monospace', fontSize: 12 },
        formatter: (params: any) => {
          const idx = params[0].dataIndex
          const y = years[idx]
          const pct = Math.round((y.completed / y.planned) * 100)
          return `${y.year}\n✅ ${y.completed} / 🎯 ${y.planned}  —  ${pct}%`
        },
      },
      xAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#374151' } },
        axisLabel: {
          color: '#9ca3af',
          fontFamily: 'Space Mono, monospace',
          fontSize: 11,
        },
        splitLine: { show: false },
        min: 0,
      },
      yAxis: {
        type: 'category',
        data: yearsLabel,
        axisLine: { show: false },
        axisLabel: {
          color: '#d1d5db',
          fontFamily: 'Space Mono, monospace',
          fontSize: 12,
          fontWeight: 600,
        },
        inverse: true,
      },
      series: [
        {
          type: 'bar',
          stack: 'total',
          name: 'Lansements réussis',
          data: completedData,
          barWidth: '60%',
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: '#10b981' },
                { offset: 1, color: '#059669' },
              ],
            },
          },
          label: {
            show: true,
            position: 'right',
            color: '#d1d5db',
            fontFamily: 'Space Mono, monospace',
            fontSize: 11,
            formatter: (params: any) => `${params.data}`,
          },
        },
        {
          type: 'bar',
          stack: 'total',
          name: 'Échecs',
          data: failedData,
          barWidth: '60%',
          itemStyle: {
            color: '#ef4444',
          },
          label: {
            show: true,
            position: 'right',
            color: '#f87171',
            fontFamily: 'Space Mono, monospace',
            fontSize: 11,
            formatter: (params: any) => (params.data > 0 ? `${params.data}` : ''),
          },
        },
      ],
    }

    const instance = echarts.init(chartRef.current, undefined, { renderer: 'canvas' })
    instance.setOption(option)
    instanceRef.current = instance

    const resizeObserver = new ResizeObserver(() => {
      instance.resize()
    })
    resizeObserver.observe(chartRef.current)

    return () => {
      resizeObserver.disconnect()
      instance.dispose()
    }
  }, [cadence])

  return (
    <div className="echarts-container" style={{ height: 200 }}>
      <div ref={chartRef} className="annual-launch-chart" style={{ height: '100%' }} />
    </div>
  )
}

export default AnnualLaunchRecordChart
