import React, { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  VisualMapComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { StatsLandingSites } from './types'

echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  VisualMapComponent,
  CanvasRenderer,
])

function LandingSitesChart({ sites }: { sites: StatsLandingSites }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    const siteNames = ['LZ-1', 'LZ-2', 'LZ-4', 'LZ-40', 'ASOG', 'JRTI', 'OCISLY', 'Mechazilla']
    const siteData: Array<{ name: string; landed: number; attempts: number; rate: number }> = [
      { name: 'LZ-1', landed: sites.LZ1.landed, attempts: sites.LZ1.attempts, rate: sites.LZ1.rate },
      { name: 'LZ-2', landed: sites.LZ2.landed, attempts: sites.LZ2.attempts, rate: sites.LZ2.rate },
      { name: 'LZ-4', landed: sites.LZ4.landed, attempts: sites.LZ4.attempts, rate: sites.LZ4.rate },
      { name: 'LZ-40', landed: sites.LZ40.landed, attempts: sites.LZ40.attempts, rate: sites.LZ40.rate },
      { name: 'ASOG', landed: sites.ASOG.landed, attempts: sites.ASOG.attempts, rate: sites.ASOG.rate },
      { name: 'JRTI', landed: sites.JRTI.landed, attempts: sites.JRTI.attempts, rate: sites.JRTI.rate },
      { name: 'OCISLY', landed: sites.OCISLY.landed, attempts: sites.OCISLY.attempts, rate: sites.OCISLY.rate },
      { name: 'Mechazilla', landed: sites.Catch.landed, attempts: sites.Catch.attempts, rate: sites.Catch.rate },
    ].sort((a, b) => a.name.localeCompare(b.name))

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
    <div className="echarts-container">
      <div ref={chartRef} className="landing-sites-chart" />
    </div>
  )
}

export default LandingSitesChart
