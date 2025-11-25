import { useEffect, useRef, useMemo, useState } from 'react'
import { Result, useAtomValue } from '@effect-atom/atom-react'
import * as d3 from 'd3'
import { WeightLogListAtom, InjectionLogListAtom } from '../../rpc.js'
import type { WeightLog, InjectionLog } from '@scale/shared'

// ============================================
// Configurable color palette for dosages
// ============================================

/** Default color palette - maps dosage strings to colors */
const DEFAULT_DOSAGE_COLORS: Record<string, string> = {
  '2.5mg': '#06b6d4', // cyan
  '5mg': '#8b5cf6', // violet
  '7.5mg': '#f59e0b', // amber
  '10mg': '#ef4444', // red
  '12.5mg': '#ec4899', // pink
  '15mg': '#14b8a6', // teal
}

/** Fallback colors for unknown dosages */
const FALLBACK_COLORS = ['#6366f1', '#84cc16', '#f97316', '#0ea5e9', '#a855f7', '#22c55e']

/** Get color for a dosage, with fallback */
function getDosageColor(dosage: string, colorMap: Record<string, string> = DEFAULT_DOSAGE_COLORS): string {
  const mapped = colorMap[dosage]
  if (mapped) return mapped
  // Generate consistent color for unknown dosages based on hash
  const hash = dosage.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] ?? '#6366f1'
}

// ============================================
// Types
// ============================================

interface DataPoint {
  date: Date
  weight: number
  notes?: string | null
}

interface InjectionPoint {
  date: Date
  weight: number
  dosage: string
  drug: string
  injectionSite?: string | null
  notes?: string | null
}

interface WeightPointWithColor extends DataPoint {
  color: string
}

// ============================================
// Tooltip Component
// ============================================

function Tooltip({ content, position }: { content: React.ReactNode; position: { x: number; y: number } | null }) {
  if (!position) return null
  return (
    <div
      style={{
        position: 'fixed',
        left: position.x + 10,
        top: position.y - 10,
        backgroundColor: '#1f2937',
        color: '#fff',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '12px',
        lineHeight: '1.4',
        pointerEvents: 'none',
        zIndex: 1000,
        maxWidth: '250px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      {content}
    </div>
  )
}

interface ChartProps {
  weightData: DataPoint[]
  injectionData: InjectionPoint[]
  dosageColors?: Record<string, string>
}

// ============================================
// Chart Component
// ============================================

interface TooltipState {
  content: React.ReactNode
  position: { x: number; y: number }
}

function WeightChart({ weightData, injectionData, dosageColors = DEFAULT_DOSAGE_COLORS }: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    if (!svgRef.current || weightData.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 30, right: 30, bottom: 40, left: 50 }
    const width = 800 - margin.left - margin.right
    const height = 400 - margin.top - margin.bottom

    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Sort data by date
    const sortedWeight = [...weightData].sort((a, b) => a.date.getTime() - b.date.getTime())
    const sortedInjections = [...injectionData].sort((a, b) => a.date.getTime() - b.date.getTime())

    // X scale - time
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(sortedWeight, (d) => d.date) as [Date, Date])
      .range([0, width])

    // Y scale - weight with some padding
    const weightExtent = d3.extent(sortedWeight, (d) => d.weight) as [number, number]
    const yPadding = (weightExtent[1] - weightExtent[0]) * 0.1 || 5
    const yScale = d3
      .scaleLinear()
      .domain([weightExtent[0] - yPadding, weightExtent[1] + yPadding])
      .range([height, 0])

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.15)
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => ''),
      )

    // Assign colors to weight points based on most recent injection
    const weightPointsWithColors: WeightPointWithColor[] = sortedWeight.map((wp) => {
      // Find most recent injection before this weight point
      const recentInjection = sortedInjections.filter((inj) => inj.date.getTime() <= wp.date.getTime()).pop()
      const color = recentInjection ? getDosageColor(recentInjection.dosage, dosageColors) : '#9ca3af' // gray for points before any injection
      return { ...wp, color }
    })

    // Group consecutive points by color to draw line segments
    const segments: { points: WeightPointWithColor[]; color: string }[] = []
    let currentSegment: WeightPointWithColor[] = []
    let currentColor = ''

    for (const point of weightPointsWithColors) {
      if (point.color !== currentColor) {
        if (currentSegment.length > 0) {
          segments.push({ points: currentSegment, color: currentColor })
          // Start new segment with last point of previous (for continuity)
          const lastPoint = currentSegment[currentSegment.length - 1]
          if (lastPoint) currentSegment = [lastPoint]
        }
        currentColor = point.color
      }
      currentSegment.push(point)
    }
    if (currentSegment.length > 0) {
      segments.push({ points: currentSegment, color: currentColor })
    }

    // Line generator
    const line = d3
      .line<DataPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.weight))
      .curve(d3.curveMonotoneX)

    // Draw line segments with different colors
    for (const segment of segments) {
      if (segment.points.length < 2) continue
      g.append('path')
        .datum(segment.points)
        .attr('fill', 'none')
        .attr('stroke', segment.color)
        .attr('stroke-width', 3)
        .attr('d', line)
    }

    // Format date for tooltip
    const formatDate = d3.timeFormat('%b %d, %Y')

    // Draw weight points with colors
    g.selectAll('.weight-point')
      .data(weightPointsWithColors)
      .enter()
      .append('circle')
      .attr('class', 'weight-point')
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScale(d.weight))
      .attr('r', 5)
      .attr('fill', (d) => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('r', 7)
        setTooltip({
          content: (
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{d.weight} lbs</div>
              <div style={{ color: '#9ca3af' }}>{formatDate(d.date)}</div>
              {d.notes && <div style={{ marginTop: '4px', fontStyle: 'italic' }}>{d.notes}</div>}
            </div>
          ),
          position: { x: event.clientX, y: event.clientY },
        })
      })
      .on('mousemove', (event) => {
        setTooltip((prev) => (prev ? { ...prev, position: { x: event.clientX, y: event.clientY } } : null))
      })
      .on('mouseleave', function () {
        d3.select(this).attr('r', 5)
        setTooltip(null)
      })

    // Draw injection markers
    const injectionPointsOnLine = sortedInjections
      .map((inj) => {
        // Find closest weight for this injection date
        const closestWeight = sortedWeight.reduce((prev, curr) =>
          Math.abs(curr.date.getTime() - inj.date.getTime()) < Math.abs(prev.date.getTime() - inj.date.getTime())
            ? curr
            : prev,
        )
        return {
          ...inj,
          weight: closestWeight.weight,
          displayDate: inj.date,
          color: getDosageColor(inj.dosage, dosageColors),
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
      .attr('transform', (d) => `translate(${xScale(d.displayDate)},${yScale(d.weight) - 18})`)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).select('rect').attr('transform', 'scale(1.1)')
        setTooltip({
          content: (
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{d.drug}</div>
              <div>Dosage: {d.dosage}</div>
              <div style={{ color: '#9ca3af' }}>{formatDate(d.displayDate)}</div>
              {d.injectionSite && <div>Site: {d.injectionSite}</div>}
              {d.notes && <div style={{ marginTop: '4px', fontStyle: 'italic' }}>{d.notes}</div>}
            </div>
          ),
          position: { x: event.clientX, y: event.clientY },
        })
      })
      .on('mousemove', (event) => {
        setTooltip((prev) => (prev ? { ...prev, position: { x: event.clientX, y: event.clientY } } : null))
      })
      .on('mouseleave', function () {
        d3.select(this).select('rect').attr('transform', 'scale(1)')
        setTooltip(null)
      })

    // Injection pill background
    injectionGroup
      .append('rect')
      .attr('rx', 10)
      .attr('ry', 10)
      .attr('x', -25)
      .attr('y', -12)
      .attr('width', 50)
      .attr('height', 20)
      .attr('fill', (d) => d.color)

    // Injection dosage text
    injectionGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#fff')
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
  }, [weightData, injectionData, dosageColors])

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', maxWidth: '800px' }} />
      <Tooltip content={tooltip?.content} position={tooltip?.position ?? null} />
    </div>
  )
}

// ============================================
// Stats Card Component
// ============================================

function StatsCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div
      style={{
        backgroundColor: '#f3f4f6',
        borderRadius: '8px',
        padding: '1rem',
        minWidth: '120px',
        border: '1px solid #e5e7eb',
      }}
    >
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>{value}</div>
    </div>
  )
}

// ============================================
// Dashboard Component
// ============================================

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
      notes: w.notes,
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
      injectionSite: inj.injectionSite,
      notes: inj.notes,
    }))
  }, [injectionResult, weightResult])

  if (Result.isWaiting(weightResult) || Result.isWaiting(injectionResult)) {
    return <div style={{ padding: '2rem' }}>Loading...</div>
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1rem' }}>Weight Change</h2>

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
        <p style={{ color: '#6b7280' }}>No weight data yet. Add some entries to see your progress!</p>
      )}
    </div>
  )
}
