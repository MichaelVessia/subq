import { useEffect, useRef, useMemo, useState } from 'react'
import { Result, useAtomValue } from '@effect-atom/atom-react'
import * as d3 from 'd3'
import { createWeightLogListAtom, createInjectionLogListAtom } from '../../rpc.js'
import type { WeightLog, InjectionLog } from '@scale/shared'

// ============================================
// Time Range Options
// ============================================

type TimeRangeKey = '1m' | '3m' | '6m' | '1y' | 'all'

interface TimeRangeOption {
  label: string
  getRange: () => { startDate?: Date; endDate?: Date }
}

const TIME_RANGES: Record<TimeRangeKey, TimeRangeOption> = {
  '1m': {
    label: '1 Month',
    getRange: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 1)
      return { startDate: start, endDate: end }
    },
  },
  '3m': {
    label: '3 Months',
    getRange: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 3)
      return { startDate: start, endDate: end }
    },
  },
  '6m': {
    label: '6 Months',
    getRange: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 6)
      return { startDate: start, endDate: end }
    },
  },
  '1y': {
    label: '1 Year',
    getRange: () => {
      const end = new Date()
      const start = new Date()
      start.setFullYear(start.getFullYear() - 1)
      return { startDate: start, endDate: end }
    },
  },
  all: {
    label: 'All Time',
    getRange: () => ({}),
  },
}

// ============================================
// Color palette for dosages - muted tones
// ============================================

const DOSAGE_COLORS: Record<string, string> = {
  '2.5mg': '#64748b', // slate
  '5mg': '#0891b2', // cyan
  '7.5mg': '#0d9488', // teal
  '10mg': '#059669', // emerald
  '12.5mg': '#7c3aed', // violet
  '15mg': '#be185d', // pink
}

const FALLBACK_COLORS = ['#64748b', '#475569', '#334155', '#1e293b', '#0f172a']

function getDosageColor(dosage: string): string {
  const mapped = DOSAGE_COLORS[dosage]
  if (mapped) return mapped
  const hash = dosage.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] ?? '#64748b'
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
        left: position.x + 12,
        top: position.y - 12,
        backgroundColor: 'var(--color-text)',
        color: 'var(--color-surface)',
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-xs)',
        lineHeight: '1.5',
        pointerEvents: 'none',
        zIndex: 1000,
        maxWidth: '220px',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {content}
    </div>
  )
}

// ============================================
// Chart Component
// ============================================

interface TooltipState {
  content: React.ReactNode
  position: { x: number; y: number }
}

interface ChartProps {
  weightData: DataPoint[]
  injectionData: InjectionPoint[]
}

function WeightChart({ weightData, injectionData }: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || weightData.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const containerWidth = containerRef.current.clientWidth
    const margin = { top: 40, right: 20, bottom: 40, left: 50 }
    const width = containerWidth - margin.left - margin.right
    const height = 320 - margin.top - margin.bottom

    svg.attr('width', containerWidth).attr('height', 320)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Sort data
    const sortedWeight = [...weightData].sort((a, b) => a.date.getTime() - b.date.getTime())
    const sortedInjections = [...injectionData].sort((a, b) => a.date.getTime() - b.date.getTime())

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(sortedWeight, (d) => d.date) as [Date, Date])
      .range([0, width])

    const weightExtent = d3.extent(sortedWeight, (d) => d.weight) as [number, number]
    const yPadding = (weightExtent[1] - weightExtent[0]) * 0.15 || 5
    const yScale = d3
      .scaleLinear()
      .domain([weightExtent[0] - yPadding, weightExtent[1] + yPadding])
      .range([height, 0])

    // Grid lines - very subtle
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.08)
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => ''),
      )
      .call((g) => g.select('.domain').remove())

    // Color points by current dosage
    const weightPointsWithColors: WeightPointWithColor[] = sortedWeight.map((wp) => {
      const recentInjection = sortedInjections.filter((inj) => inj.date.getTime() <= wp.date.getTime()).pop()
      const color = recentInjection ? getDosageColor(recentInjection.dosage) : '#94a3b8'
      return { ...wp, color }
    })

    // Group by color for line segments
    const segments: { points: WeightPointWithColor[]; color: string }[] = []
    let currentSegment: WeightPointWithColor[] = []
    let currentColor = ''

    for (const point of weightPointsWithColors) {
      if (point.color !== currentColor) {
        if (currentSegment.length > 0) {
          segments.push({ points: currentSegment, color: currentColor })
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

    // Draw segments
    for (const segment of segments) {
      if (segment.points.length < 2) continue
      g.append('path')
        .datum(segment.points)
        .attr('fill', 'none')
        .attr('stroke', segment.color)
        .attr('stroke-width', 2)
        .attr('d', line)
    }

    const formatDate = d3.timeFormat('%b %d, %Y')

    // Weight points
    g.selectAll('.weight-point')
      .data(weightPointsWithColors)
      .enter()
      .append('circle')
      .attr('class', 'weight-point')
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScale(d.weight))
      .attr('r', 4)
      .attr('fill', (d) => d.color)
      .attr('stroke', 'var(--color-surface)')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('r', 6)
        setTooltip({
          content: (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>{d.weight} lbs</div>
              <div style={{ opacity: 0.7 }}>{formatDate(d.date)}</div>
              {d.notes && <div style={{ marginTop: '4px', opacity: 0.8 }}>{d.notes}</div>}
            </div>
          ),
          position: { x: event.clientX, y: event.clientY },
        })
      })
      .on('mousemove', (event) => {
        setTooltip((prev) => (prev ? { ...prev, position: { x: event.clientX, y: event.clientY } } : null))
      })
      .on('mouseleave', function () {
        d3.select(this).attr('r', 4)
        setTooltip(null)
      })

    // Injection markers - positioned above chart, not overlapping data
    const injectionPointsOnLine = sortedInjections
      .map((inj) => {
        const closestWeight = sortedWeight.reduce((prev, curr) =>
          Math.abs(curr.date.getTime() - inj.date.getTime()) < Math.abs(prev.date.getTime() - inj.date.getTime())
            ? curr
            : prev,
        )
        return {
          ...inj,
          weight: closestWeight.weight,
          displayDate: inj.date,
          color: getDosageColor(inj.dosage),
        }
      })
      .filter((inj) => {
        const dateRange = xScale.domain()
        const [start, end] = dateRange
        if (!start || !end) return false
        return inj.displayDate >= start && inj.displayDate <= end
      })

    // Injection vertical lines (subtle)
    g.selectAll('.injection-line')
      .data(injectionPointsOnLine)
      .enter()
      .append('line')
      .attr('class', 'injection-line')
      .attr('x1', (d) => xScale(d.displayDate))
      .attr('x2', (d) => xScale(d.displayDate))
      .attr('y1', -20)
      .attr('y2', (d) => yScale(d.weight))
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0.4)

    // Injection labels at top
    const injectionGroup = g
      .selectAll('.injection-group')
      .data(injectionPointsOnLine)
      .enter()
      .append('g')
      .attr('class', 'injection-group')
      .attr('transform', (d) => `translate(${xScale(d.displayDate)},-28)`)
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        setTooltip({
          content: (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>{d.drug}</div>
              <div>{d.dosage}</div>
              <div style={{ opacity: 0.7 }}>{formatDate(d.displayDate)}</div>
              {d.injectionSite && <div style={{ marginTop: '2px' }}>Site: {d.injectionSite}</div>}
              {d.notes && <div style={{ marginTop: '4px', opacity: 0.8 }}>{d.notes}</div>}
            </div>
          ),
          position: { x: event.clientX, y: event.clientY },
        })
      })
      .on('mousemove', (event) => {
        setTooltip((prev) => (prev ? { ...prev, position: { x: event.clientX, y: event.clientY } } : null))
      })
      .on('mouseleave', () => setTooltip(null))

    // Pill background
    injectionGroup
      .append('rect')
      .attr('rx', 10)
      .attr('ry', 10)
      .attr('x', -22)
      .attr('y', -10)
      .attr('width', 44)
      .attr('height', 18)
      .attr('fill', (d) => d.color)

    // Dosage text
    injectionGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .text((d) => d.dosage)

    // Axes - minimal styling
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickFormat(d3.timeFormat('%b %d') as (d: d3.NumberValue) => string),
      )
      .call((g) => g.select('.domain').attr('stroke', '#e5e7eb'))
      .call((g) => g.selectAll('.tick line').attr('stroke', '#e5e7eb'))
      .call((g) => g.selectAll('.tick text').attr('fill', '#9ca3af').attr('font-size', '11px'))

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line').remove())
      .call((g) => g.selectAll('.tick text').attr('fill', '#9ca3af').attr('font-size', '11px'))

    // Y axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -40)
      .attr('x', -height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9ca3af')
      .attr('font-size', '11px')
      .text('Weight (lbs)')
  }, [weightData, injectionData])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg ref={svgRef} style={{ display: 'block' }} />
      <Tooltip content={tooltip?.content} position={tooltip?.position ?? null} />
    </div>
  )
}

// ============================================
// Stat Item - minimal design
// ============================================

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 600,
          color: 'var(--color-text)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ============================================
// Time Range Selector
// ============================================

function TimeRangeSelector({ selected, onChange }: { selected: TimeRangeKey; onChange: (key: TimeRangeKey) => void }) {
  const keys = Object.keys(TIME_RANGES) as TimeRangeKey[]
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-6)',
      }}
    >
      {keys.map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          type="button"
          style={{
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            backgroundColor: selected === key ? 'var(--color-text)' : 'var(--color-surface)',
            color: selected === key ? 'var(--color-surface)' : 'var(--color-text)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {TIME_RANGES[key].label}
        </button>
      ))}
    </div>
  )
}

// ============================================
// Dashboard Component
// ============================================

export function Dashboard() {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('3m')

  // Create atoms based on selected time range
  const { startDate, endDate } = useMemo(() => TIME_RANGES[timeRange].getRange(), [timeRange])

  const weightAtom = useMemo(() => createWeightLogListAtom(startDate, endDate), [startDate, endDate])
  const injectionAtom = useMemo(() => createInjectionLogListAtom(startDate, endDate), [startDate, endDate])

  const weightResult = useAtomValue(weightAtom)
  const injectionResult = useAtomValue(injectionAtom)

  const stats = useMemo(() => {
    const weights = Result.getOrElse(weightResult, () => [] as WeightLog[])
    if (weights.length < 2) return null

    const sorted = [...weights].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (!first || !last) return null

    const totalChange = last.weight - first.weight
    const percentChange = (totalChange / first.weight) * 100

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
      weight: 0,
      dosage: inj.dosage,
      drug: inj.drug,
      injectionSite: inj.injectionSite,
      notes: inj.notes,
    }))
  }, [injectionResult, weightResult])

  if (Result.isWaiting(weightResult) || Result.isWaiting(injectionResult)) {
    return <div className="loading">Loading...</div>
  }

  return (
    <div>
      <TimeRangeSelector selected={timeRange} onChange={setTimeRange} />

      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 'var(--space-6)',
            marginBottom: 'var(--space-8)',
            paddingBottom: 'var(--space-6)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <StatItem label="Current" value={`${stats.currentWeight} lbs`} />
          <StatItem label="Total Change" value={`${stats.totalChange} lbs`} />
          <StatItem label="Change %" value={`${stats.percentChange}%`} />
          <StatItem label="Weekly Avg" value={`${stats.weeklyAvg} lbs/wk`} />
        </div>
      )}

      {weightData.length > 0 ? (
        <WeightChart weightData={weightData} injectionData={injectionData} />
      ) : (
        <div className="empty-state">No weight data yet. Add some entries to see your progress.</div>
      )}
    </div>
  )
}
