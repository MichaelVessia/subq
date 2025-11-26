import { Result, useAtomValue } from '@effect-atom/atom-react'
import type { DashboardStats, InjectionLog, WeightLog } from '@scale/shared'
import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createDashboardStatsAtom, createInjectionLogListAtom, createWeightLogListAtom } from '../../rpc.js'
import {
  type DataPoint,
  getDosageColor,
  type InjectionPoint,
  TIME_RANGES,
  type TimeRangeKey,
  TimeRangeSelector,
  Tooltip,
  type WeightPointWithColor,
} from '../shared/chartUtils.js'

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
  zoomRange: { start: Date; end: Date } | null
  onZoom: (range: { start: Date; end: Date }) => void
}

function WeightChart({ weightData, injectionData, zoomRange, onZoom }: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || weightData.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const containerWidth = containerRef.current.clientWidth

    // Sort data first (needed to calculate pill rows for dynamic margin)
    const allSortedWeight = [...weightData].sort((a, b) => a.date.getTime() - b.date.getTime())
    const allSortedInjections = [...injectionData].sort((a, b) => a.date.getTime() - b.date.getTime())

    // Filter to zoom range if set
    const sortedWeight = zoomRange
      ? allSortedWeight.filter((d) => d.date >= zoomRange.start && d.date <= zoomRange.end)
      : allSortedWeight
    const sortedInjections = zoomRange
      ? allSortedInjections.filter((d) => d.date >= zoomRange.start && d.date <= zoomRange.end)
      : allSortedInjections

    if (sortedWeight.length === 0) return

    // Pre-calculate how many rows of pills we need
    const PILL_WIDTH_SINGLE = 44
    const PILL_HEIGHT = 18
    const MIN_GAP_X = 4

    // Create temporary x scale to calculate pill positions
    const tempXScale = d3
      .scaleTime()
      .domain(d3.extent(sortedWeight, (d) => d.date) as [Date, Date])
      .range([0, containerWidth - 90]) // approximate width

    // Pre-calculate dosage changes only
    interface TempChange {
      x: number
      row: number
    }
    const tempChanges: TempChange[] = []
    let tempPrevDosage = ''
    for (const inj of sortedInjections) {
      const dateRange = tempXScale.domain()
      const [start, end] = dateRange
      if (start && end && inj.date >= start && inj.date <= end) {
        if (inj.dosage !== tempPrevDosage) {
          tempChanges.push({ x: tempXScale(inj.date), row: 0 })
          tempPrevDosage = inj.dosage
        }
      }
    }

    // Calculate rows needed
    let maxRow = 0
    for (let i = 0; i < tempChanges.length; i++) {
      const change = tempChanges[i]!
      const occupiedRows: number[] = []

      for (let j = 0; j < i; j++) {
        const prev = tempChanges[j]!
        if (Math.abs(change.x - prev.x) < PILL_WIDTH_SINGLE + MIN_GAP_X) {
          occupiedRows.push(prev.row)
        }
      }

      let row = 0
      while (occupiedRows.includes(row)) row++
      change.row = row
      maxRow = Math.max(maxRow, row)
    }

    // Dynamic top margin based on pill rows, extra left margin for pills
    const baseTopMargin = 40
    const extraMarginPerRow = PILL_HEIGHT + 2
    const margin = { top: baseTopMargin + maxRow * extraMarginPerRow, right: 30, bottom: 40, left: 60 }
    const width = containerWidth - margin.left - margin.right
    const totalHeight = 320 + maxRow * extraMarginPerRow
    const height = totalHeight - margin.top - margin.bottom

    svg.attr('width', containerWidth).attr('height', totalHeight)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

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

    // Brush for zoom selection - add BEFORE data points so points receive mouse events
    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [width, height],
      ])
      .on('end', (event) => {
        if (!event.selection) return
        const [x0, x1] = event.selection as [number, number]
        const newStart = xScale.invert(x0)
        const newEnd = xScale.invert(x1)
        // Clear the brush selection visually
        svg.select('.brush').call(brush.move as any, null)
        onZoom({ start: newStart, end: newEnd })
      })

    g.append('g').attr('class', 'brush').call(brush).selectAll('rect').attr('rx', 3).attr('ry', 3)

    // Style the brush selection
    g.select('.brush .selection')
      .attr('fill', 'var(--color-text)')
      .attr('fill-opacity', 0.1)
      .attr('stroke', 'var(--color-text)')
      .attr('stroke-opacity', 0.3)

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

    // Only show pills for dosage CHANGES (when dosage differs from previous)
    type InjectionPointType = (typeof injectionPointsOnLine)[0]
    interface DosageChange {
      item: InjectionPointType
      x: number
      row: number
      isContext?: boolean // true if this is showing context from before zoom window
    }

    const dosageChanges: DosageChange[] = []

    // When zoomed, find the active dosage at the start of the window
    // by looking at all injections (not just filtered ones)
    if (zoomRange && injectionPointsOnLine.length === 0) {
      // No injections in view - find the most recent one before the zoom start
      const priorInjection = allSortedInjections.filter((inj) => inj.date < zoomRange.start).pop()

      if (priorInjection && sortedWeight.length > 0) {
        const firstWeight = sortedWeight[0]!
        dosageChanges.push({
          item: {
            ...priorInjection,
            weight: firstWeight.weight,
            displayDate: zoomRange.start,
            color: getDosageColor(priorInjection.dosage),
          },
          x: xScale(zoomRange.start),
          row: 0,
          isContext: true,
        })
      }
    } else if (zoomRange && injectionPointsOnLine.length > 0) {
      // There are injections in view - check if first one is a "change" or if we need context
      const firstInView = injectionPointsOnLine[0]!
      const priorInjection = allSortedInjections.filter((inj) => inj.date < zoomRange.start).pop()

      // If there's a prior injection with same dosage as first in view, no context needed
      // If prior injection has different dosage, show it as context
      if (priorInjection && priorInjection.dosage !== firstInView.dosage) {
        const firstWeight = sortedWeight[0]!
        dosageChanges.push({
          item: {
            ...priorInjection,
            weight: firstWeight.weight,
            displayDate: zoomRange.start,
            color: getDosageColor(priorInjection.dosage),
          },
          x: xScale(zoomRange.start),
          row: 0,
          isContext: true,
        })
      } else if (priorInjection && priorInjection.dosage === firstInView.dosage) {
        // Same dosage continues - show context pill at start
        const firstWeight = sortedWeight[0]!
        dosageChanges.push({
          item: {
            ...priorInjection,
            weight: firstWeight.weight,
            displayDate: zoomRange.start,
            color: getDosageColor(priorInjection.dosage),
          },
          x: xScale(zoomRange.start),
          row: 0,
          isContext: true,
        })
      }
    }

    let prevDosage = dosageChanges.length > 0 ? dosageChanges[0]!.item.dosage : ''
    for (const inj of injectionPointsOnLine) {
      if (inj.dosage !== prevDosage) {
        dosageChanges.push({
          item: inj,
          x: xScale(inj.displayDate),
          row: 0,
        })
        prevDosage = inj.dosage
      }
    }

    // Assign rows to avoid overlap
    for (let i = 0; i < dosageChanges.length; i++) {
      const change = dosageChanges[i]!
      const occupiedRows: number[] = []

      for (let j = 0; j < i; j++) {
        const prev = dosageChanges[j]!
        if (Math.abs(change.x - prev.x) < PILL_WIDTH_SINGLE + MIN_GAP_X) {
          occupiedRows.push(prev.row)
        }
      }

      let row = 0
      while (occupiedRows.includes(row)) row++
      change.row = row
    }

    const rowOffset = (row: number) => row * (PILL_HEIGHT + 2)

    // Injection labels at top - only dosage changes
    const injectionGroup = g
      .selectAll('.injection-group')
      .data(dosageChanges)
      .enter()
      .append('g')
      .attr('class', 'injection-group')
      .attr('transform', (d) => `translate(${Math.max(PILL_WIDTH_SINGLE / 2, d.x)},${-28 - rowOffset(d.row)})`)
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        setTooltip({
          content: (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>Started {d.item.dosage}</div>
              <div style={{ opacity: 0.7 }}>{formatDate(d.item.displayDate)}</div>
              <div style={{ marginTop: '4px', fontSize: '9px', opacity: 0.6 }}>{d.item.drug}</div>
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
      .attr('x', -PILL_WIDTH_SINGLE / 2)
      .attr('y', -10)
      .attr('width', PILL_WIDTH_SINGLE)
      .attr('height', PILL_HEIGHT)
      .attr('fill', (d) => d.item.color)

    // Dosage text
    injectionGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .text((d) => d.item.dosage)

    // Single vertical line per dosage change
    g.selectAll('.injection-line')
      .data(dosageChanges)
      .enter()
      .append('line')
      .attr('class', 'injection-line')
      .attr('x1', (d) => Math.max(PILL_WIDTH_SINGLE / 2, d.x))
      .attr('x2', (d) => Math.max(PILL_WIDTH_SINGLE / 2, d.x))
      .attr('y1', (d) => -20 - rowOffset(d.row))
      .attr('y2', (d) => yScale(d.item.weight))
      .attr('stroke', (d) => d.item.color)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0.4)

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
  }, [weightData, injectionData, zoomRange, onZoom])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg ref={svgRef} style={{ display: 'block', cursor: 'crosshair' }} />
      <Tooltip content={tooltip?.content} position={tooltip?.position ?? null} />
      {!zoomRange && (
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            opacity: 0.6,
          }}
        >
          Drag to zoom
        </div>
      )}
    </div>
  )
}

// ============================================
// Stat Item - minimal design
// ============================================

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
      <span
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          color: 'var(--color-text)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ============================================
// Dashboard Component
// ============================================

export function Dashboard({ userId }: { userId: string }) {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')
  const [zoomRange, setZoomRange] = useState<{ start: Date; end: Date } | null>(null)

  // Create atoms based on selected time range
  const { startDate, endDate } = useMemo(() => TIME_RANGES[timeRange].getRange(), [timeRange])

  // Reset zoom when time range changes
  const handleTimeRangeChange = (key: TimeRangeKey) => {
    setTimeRange(key)
    setZoomRange(null)
  }

  const weightAtom = useMemo(() => createWeightLogListAtom(userId, startDate, endDate), [userId, startDate, endDate])
  const injectionAtom = useMemo(
    () => createInjectionLogListAtom(userId, startDate, endDate),
    [userId, startDate, endDate],
  )

  // Stats computed server-side - use zoom range if set, otherwise time range
  const effectiveStartDate = zoomRange?.start ?? startDate
  const effectiveEndDate = zoomRange?.end ?? endDate
  const statsAtom = useMemo(
    () => createDashboardStatsAtom(userId, effectiveStartDate, effectiveEndDate),
    [userId, effectiveStartDate, effectiveEndDate],
  )

  const weightResult = useAtomValue(weightAtom)
  const injectionResult = useAtomValue(injectionAtom)
  const statsResult = useAtomValue(statsAtom)

  // Format stats from server response
  const stats = useMemo(() => {
    const serverStats = Result.getOrElse(statsResult, () => null as DashboardStats | null)
    if (!serverStats) return null

    return {
      startWeight: serverStats.startWeight.toFixed(1),
      endWeight: serverStats.endWeight.toFixed(1),
      totalChange: serverStats.totalChange.toFixed(1),
      percentChange: serverStats.percentChange.toFixed(1),
      weeklyAvg: serverStats.weeklyAvg.toFixed(1),
    }
  }, [statsResult])

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

  if (Result.isWaiting(weightResult) || Result.isWaiting(injectionResult) || Result.isWaiting(statsResult)) {
    return <div className="loading">Loading...</div>
  }

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <TimeRangeSelector
          selected={timeRange}
          onChange={handleTimeRangeChange}
          zoomRange={zoomRange}
          onResetZoom={() => setZoomRange(null)}
          onZoomChange={setZoomRange}
        />
      </div>

      {stats && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-6)',
            marginBottom: 'var(--space-6)',
            paddingBottom: 'var(--space-4)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <StatItem label="Start" value={`${stats.startWeight} lbs`} />
          <StatItem label="End" value={`${stats.endWeight} lbs`} />
          <StatItem label="Change" value={`${stats.totalChange} lbs (${stats.percentChange}%)`} />
          <StatItem label="Avg" value={`${stats.weeklyAvg} lbs/wk`} />
        </div>
      )}

      {weightData.length > 0 ? (
        <WeightChart
          weightData={weightData}
          injectionData={injectionData}
          zoomRange={zoomRange}
          onZoom={setZoomRange}
        />
      ) : (
        <div className="empty-state">No weight data yet. Add some entries to see your progress.</div>
      )}
    </div>
  )
}
