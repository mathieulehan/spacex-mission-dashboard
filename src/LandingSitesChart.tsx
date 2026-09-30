import React, { useEffect, useRef, type ReactNode } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  VisualMapComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { StatsLandingSite } from './types'

echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  VisualMapComponent,
  CanvasRenderer,
])

function LandingSitesChart({ sites }: { sites: StatsLandingSite[] }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    const siteData: Array<{ name: string; landed: number; attempts: number; rate: number }> = sites.map(s => ({
      name: s.site,
      landed: s.landings,
      attempts: Math.round(s.landings / (s.rate / 100) || 0),
      rate: s.rate,
    })).sort((a, b) => a.name.localeCompare(b.name))

    const colors = siteData.map((d) =>
      d.rate >= 99
        ? '#10b981'
        : d.rate >= 95
        ? '#f59e0b'
        : '#6b7280',
    )

    const option: any = {
      title: {
        text: 'Recovery performance by location',
        left: 'left',
        textStyle: {
          color: '#9ca3af',
          fontSize: 12,
          fontFamily: 'Space Mono, monospace',
        },
      },
      grid: {
        left: 130,
        right: 40,
        top: 30,
        bottom: 20,
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisLabel: {
          color: '#9ca3af',
          fontFamily: 'Space Mono, monospace',
          fontSize: 11,
        },
        splitLine: {
          lineStyle: { color: '#1f2937', type: 'dashed' },
        },
      },
      yAxis: {
        type: 'category',
        data: siteData.map((d) => d.name),
        axisLine: { show: false },
        axisLabel: {
          color: '#d1d5db',
          fontFamily: 'Space Mono, monospace',
          fontSize: 12,
          fontWeight: 600,
        },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(17,24,39,0.95)',
        borderColor: '#374151',
        textStyle: { color: '#f9fafb', fontFamily: 'Space Mono, monospace', fontSize: 12 },
        formatter: (params: any) => {
          const idx = params[0].dataIndex
          const d = siteData[idx]
          return `${d.name}\n✅ ${d.landed} / 🎯 ${d.attempts}  —  ${d.rate.toFixed(1)}%`
        },
      },
      series: [
        {
          type: 'bar',
          data: siteData.map((d) => d.rate),
          barWidth: '65%',
          itemStyle: { color: (params: any) => colors[params.dataIndex] },
          label: {
            show: true,
            position: 'right',
            color: '#d1d5db',
            fontFamily: 'Space Mono, monospace',
            fontSize: 11,
            formatter: (params: any) => `${params.data.toFixed(1)}%`,
          },
        } as any],
    }

    const instance = echarts.init(chartRef.current, undefined, { renderer: 'canvas' })
    instance.setOption(option)
    instanceRef.current = instance

    const resizeObserver = new ResizeObserver(() => instance.resize())
    resizeObserver.observe(chartRef.current)

    return () => {
      resizeObserver.disconnect()
      instance.dispose()
    }
  }, [sites])

  return (
    <div className="echarts-container" style={{ height: 250 }}>
      <div ref={chartRef} className="landing-sites-chart" style={{ height: '100%' }} />
    </div>
  )
}

export default LandingSitesChart
