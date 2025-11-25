import { useEffect, useRef, useMemo } from 'react'
import { Result, useAtomValue } from '@effect-atom/atom-react'
import * as d3 from 'd3'
import { WeightLogListAtom, InjectionLogListAtom } from '../../rpc.js'
import type { WeightLog, InjectionLog } from '@scale/shared'

interface DataPoint {
  date: Date
  weight: number
}

interface InjectionPoint {
  date: Date
  weight: number
  dosage: string
  drug: string
}

function WeightChart({ weightData, injectionData }: { weightData: DataPoint[]; injectionData: InjectionPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || weightData.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 20, right: 30, bottom: 40, left: 50 }
    const width = 800 - margin.left - margin.right
    const height = 400 - margin.top - margin.bottom

    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Sort data by date
    const sortedData = [...weightData].sort((a, b) => a.date.getTime() - b.date.getTime())

    // X scale - time
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(sortedData, (d) => d.date) as [Date, Date])
      .range([0, width])

    // Y scale - weight with some padding
    const weightExtent = d3.extent(sortedData, (d) => d.weight) as [number, number]
    const yPadding = (weightExtent[1] - weightExtent[0]) * 0.1 || 5
    const yScale = d3
      .scaleLinear()
      .domain([weightExtent[0] - yPadding, weightExtent[1] + yPadding])
      .range([height, 0])

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => ''),
      )

    // Line generator
    const line = d3
      .line<DataPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.weight))
      .curve(d3.curveMonotoneX)

    // Add gradient
    const gradient = svg
      .append('defs')
      .append('linearGradient')
      .attr('id', 'line-gradient')
      .attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0)
      .attr('y1', yScale(weightExtent[0]))
      .attr('x2', 0)
      .attr('y2', yScale(weightExtent[1]))

    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#22c55e')
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#06b6d4')

    // Draw line
    g.append('path')
      .datum(sortedData)
      .attr('fill', 'none')
      .attr('stroke', 'url(#line-gradient)')
      .attr('stroke-width', 3)
      .attr('d', line)

    // Draw weight points
    g.selectAll('.weight-point')
      .data(sortedData)
      .enter()
      .append('circle')
      .attr('class', 'weight-point')
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScale(d.weight))
      .attr('r', 5)
      .attr('fill', '#06b6d4')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    // Draw injection points
    const injectionPointsOnLine = injectionData
      .map((inj) => {
        // Find closest weight for this injection date
        const closestWeight = sortedData.reduce((prev, curr) =>
          Math.abs(curr.date.getTime() - inj.date.getTime()) < Math.abs(prev.date.getTime() - inj.date.getTime())
            ? curr
            : prev,
        )
        return {
          ...inj,
          weight: closestWeight.weight,
          displayDate: inj.date,
        }
      })
      .filter((inj) => {
        const dateRange = xScale.domain()
        const [start, end] = dateRange
        if (!start || !end) return false
        return inj.displayDate >= start && inj.displayDate <= end
      })

    // Injection markers
    const injectionGroup = g
      .selectAll('.injection-group')
      .data(injectionPointsOnLine)
      .enter()
      .append('g')
      .attr('class', 'injection-group')
      .attr('transform', (d) => `translate(${xScale(d.displayDate)},${yScale(d.weight) - 15})`)

    // Injection pill background
    injectionGroup
      .append('rect')
      .attr('rx', 10)
      .attr('ry', 10)
      .attr('x', -25)
      .attr('y', -12)
      .attr('width', 50)
      .attr('height', 20)
      .attr('fill', '#eab308')

    // Injection dosage text
    injectionGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#000')
      .attr('font-size', '11px')
      .attr('font-weight', 'bold')
      .text((d) => d.dosage)

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(6)
          .tickFormat(d3.timeFormat('%b %d') as (d: d3.NumberValue) => string),
      )
      .attr('color', '#666')

    // Y axis
    g.append('g').call(d3.axisLeft(yScale).ticks(5)).attr('color', '#666')

    // Y axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -40)
      .attr('x', -height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
      .text('Weight (lbs)')
  }, [weightData, injectionData])

  return <svg ref={svgRef} style={{ width: '100%', maxWidth: '800px' }} />
}

function StatsCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div
      style={{
        backgroundColor: '#1f2937',
        borderRadius: '8px',
        padding: '1rem',
        minWidth: '120px',
      }}
    >
      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fff' }}>{value}</div>
    </div>
  )
}

export function Dashboard() {
  const weightResult = useAtomValue(WeightLogListAtom)
  const injectionResult = useAtomValue(InjectionLogListAtom)

  const stats = useMemo(() => {
    const weights = Result.getOrElse(weightResult, () => [] as WeightLog[])
    if (weights.length < 2) return null

    const sorted = [...weights].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (!first || !last) return null

    const totalChange = last.weight - first.weight
    const percentChange = (totalChange / first.weight) * 100

    // Calculate weekly average (if we have enough data)
    const daysDiff = (new Date(last.datetime).getTime() - new Date(first.datetime).getTime()) / (1000 * 60 * 60 * 24)
    const weeks = daysDiff / 7
    const weeklyAvg = weeks > 0 ? totalChange / weeks : 0

    return {
      totalChange: totalChange.toFixed(1),
      percentChange: percentChange.toFixed(1),
      weeklyAvg: weeklyAvg.toFixed(1),
      currentWeight: last.weight.toFixed(1),
    }
  }, [weightResult])

  const weightData = useMemo((): DataPoint[] => {
    const weights = Result.getOrElse(weightResult, () => [] as WeightLog[])
    return weights.map((w) => ({
      date: new Date(w.datetime),
      weight: w.weight,
    }))
  }, [weightResult])

  const injectionData = useMemo((): InjectionPoint[] => {
    const injections = Result.getOrElse(injectionResult, () => [] as InjectionLog[])
    const weights = Result.getOrElse(weightResult, () => [] as WeightLog[])
    if (weights.length === 0) return []

    return injections.map((inj) => ({
      date: new Date(inj.datetime),
      weight: 0, // Will be calculated based on closest weight
      dosage: inj.dosage,
      drug: inj.drug,
    }))
  }, [injectionResult, weightResult])

  if (Result.isWaiting(weightResult) || Result.isWaiting(injectionResult)) {
    return <div style={{ padding: '2rem', color: '#fff' }}>Loading...</div>
  }

  return (
    <div
      style={{
        backgroundColor: '#111827',
        minHeight: '100vh',
        padding: '1.5rem',
        color: '#fff',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Weight Change</h1>

      {stats && (
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '2rem',
            flexWrap: 'wrap',
          }}
        >
          <StatsCard label="Total change" value={`${stats.totalChange}lbs`} icon="^" />
          <StatsCard label="Current" value={`${stats.currentWeight}lbs`} icon="*" />
          <StatsCard label="Percent" value={`${stats.percentChange}%`} icon="%" />
          <StatsCard label="Weekly avg" value={`${stats.weeklyAvg}lbs/wk`} icon="~" />
        </div>
      )}

      {weightData.length > 0 ? (
        <WeightChart weightData={weightData} injectionData={injectionData} />
      ) : (
        <p style={{ color: '#9ca3af' }}>No weight data yet. Add some entries to see your progress!</p>
      )}
    </div>
  )
}
