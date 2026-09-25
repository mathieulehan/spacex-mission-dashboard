import React, { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
])

type Goal = { planned: number; completed: number; rate: number }

function GoalBarChart({ goal }: { goal: Goal }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    const option: any = {
      grid: {
        left: 0,
        right: 0,
        top: 8,
        bottom: 8,
        width: '100%',
        height: 48,
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: ['goal'],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        inverse: true,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        borderColor: '#374151',
        textStyle: { color: '#f9fafb', fontFamily: 'Space Mono, monospace', fontSize: 11 },
        formatter: (params: any) => {
          const pct = Math.min(100, goal.rate)
          return `🎯 ${goal.completed} / ${goal.planned}  —  ${pct.toFixed(1)}%`
        },
      },
      series: [
        {
          type: 'bar',
          yAxisIndex: 0,
          xAxisIndex: 0,
          data: [Math.min(100, goal.rate)],
          barWidth: '70%',
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: '#69aaff' },
                { offset: 1, color: '#a371f7' },
              ],
            },
          },
          label: {
            show: true,
            position: 'insideRight',
            color: '#d1d5db',
            fontFamily: 'Space Mono, monospace',
            fontSize: 10,
            formatter: (params: any) => `${params.data.toFixed(1)}%`,
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
  }, [goal])

  return (
    <div className="echarts-container" style={{ height: 56 }}>
      <div ref={chartRef} className="goal-bar-chart" style={{ height: '100%' }} />
    </div>
  )
}

export default GoalBarChart
