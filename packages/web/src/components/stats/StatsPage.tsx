import { Result, useAtomValue } from '@effect-atom/atom-react'
import type {
  DosageHistoryStats,
  DrugBreakdownStats,
  InjectionFrequencyStats,
  InjectionLog,
  InjectionSiteStats,
  WeightStats,
  WeightTrendStats,
} from '@scale/shared'
import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createDosageHistoryAtom,
  createDrugBreakdownAtom,
  createInjectionFrequencyAtom,
  createInjectionLogListAtom,
  createInjectionSiteStatsAtom,
  createWeightStatsAtom,
  createWeightTrendAtom,
} from '../../rpc.js'
import {
  CHART_COLORS,
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
// Stat Card Component
// ============================================

function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
      }}
    >
      <h3
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--space-4)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  )
}

// ============================================
// Weight Summary Stats
// ============================================

function WeightSummary({ stats }: { stats: WeightStats | null }) {
  if (!stats) {
    return <div style={{ color: 'var(--color-text-muted)' }}>No weight data available</div>
  }

  const rateSign = stats.rateOfChange >= 0 ? '+' : ''
  const items = [
    { label: 'Min', value: `${stats.minWeight.toFixed(1)} lbs` },
    { label: 'Max', value: `${stats.maxWeight.toFixed(1)} lbs` },
    { label: 'Average', value: `${stats.avgWeight.toFixed(1)} lbs` },
    { label: 'Rate', value: `${rateSign}${stats.rateOfChange.toFixed(2)} lbs/wk` },
    { label: 'Entries', value: stats.entryCount.toString() },
  ]

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 'var(--space-4)' }}
    >
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{item.label}</div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Weight Trend Chart with Dosage Coloring & Zoom
// ============================================

interface TooltipState {
  content: React.ReactNode
  position: { x: number; y: number }
}

interface WeightTrendChartProps {
  weightData: DataPoint[]
  injectionData: InjectionPoint[]
  zoomRange: { start: Date; end: Date } | null
  onZoom: (range: { start: Date; end: Date }) => void
}

function WeightTrendChart({ weightData, injectionData, zoomRange, onZoom }: WeightTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || weightData.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const containerWidth = containerRef.current.clientWidth

    // Sort data first
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

    // Pre-calculate pill rows for dynamic margin
    const PILL_WIDTH_SINGLE = 44
    const PILL_HEIGHT = 18
    const MIN_GAP_X = 4

    const tempXScale = d3
      .scaleTime()
      .domain(d3.extent(sortedWeight, (d) => d.date) as [Date, Date])
      .range([0, containerWidth - 90])

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

    const baseTopMargin = 40
    const extraMarginPerRow = PILL_HEIGHT + 2
    const margin = { top: baseTopMargin + maxRow * extraMarginPerRow, right: 30, bottom: 40, left: 60 }
    const width = containerWidth - margin.left - margin.right
    const totalHeight = 320 + maxRow * extraMarginPerRow
    const height = totalHeight - margin.top - margin.bottom

    svg.attr('width', containerWidth).attr('height', totalHeight)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

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

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.08)
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => ''),
      )
      .call((sel) => sel.select('.domain').remove())

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

    const line = d3
      .line<DataPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.weight))
      .curve(d3.curveMonotoneX)

    // Brush for zoom
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
        svg.select('.brush').call(brush.move as never, null)
        onZoom({ start: newStart, end: newEnd })
      })

    g.append('g').attr('class', 'brush').call(brush).selectAll('rect').attr('rx', 3).attr('ry', 3)

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

    // Injection markers - dosage pills
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

    type InjectionPointType = (typeof injectionPointsOnLine)[0]
    interface DosageChange {
      item: InjectionPointType
      x: number
      row: number
      isContext?: boolean
    }

    const dosageChanges: DosageChange[] = []

    // Show context pill when zoomed
    if (zoomRange && injectionPointsOnLine.length === 0) {
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

    // Injection labels
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

    injectionGroup
      .append('rect')
      .attr('rx', 10)
      .attr('ry', 10)
      .attr('x', -PILL_WIDTH_SINGLE / 2)
      .attr('y', -10)
      .attr('width', PILL_WIDTH_SINGLE)
      .attr('height', PILL_HEIGHT)
      .attr('fill', (d) => d.item.color)

    injectionGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .text((d) => d.item.dosage)

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

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickFormat(d3.timeFormat('%b %d') as (d: d3.NumberValue) => string),
      )
      .call((sel) => sel.select('.domain').attr('stroke', '#e5e7eb'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', '#e5e7eb'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', '#9ca3af').attr('font-size', '11px'))

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .call((sel) => sel.selectAll('.tick text').attr('fill', '#9ca3af').attr('font-size', '11px'))

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
// Injection Site Pie Chart
// ============================================

function InjectionSitePieChart({ data }: { data: InjectionSiteStats }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.sites.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const containerWidth = containerRef.current.clientWidth
    const size = Math.min(containerWidth, 250)
    const radius = size / 2 - 10

    svg.attr('width', size).attr('height', size)

    const g = svg.append('g').attr('transform', `translate(${size / 2},${size / 2})`)

    const pie = d3
      .pie<(typeof data.sites)[0]>()
      .value((d) => d.count)
      .sort(null)

    const arc = d3
      .arc<d3.PieArcDatum<(typeof data.sites)[0]>>()
      .innerRadius(radius * 0.5)
      .outerRadius(radius)

    const color = d3
      .scaleOrdinal<string>()
      .domain(data.sites.map((d) => d.site))
      .range(CHART_COLORS)

    const arcs = g
      .selectAll('.arc')
      .data(pie([...data.sites]))
      .enter()
      .append('g')
      .attr('class', 'arc')

    arcs
      .append('path')
      .attr('d', arc)
      .attr('fill', (d) => color(d.data.site))
      .attr('stroke', 'var(--color-surface)')
      .attr('stroke-width', 2)

    arcs
      .append('text')
      .attr('transform', (d) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#fff')
      .attr('font-weight', 600)
      .text((d) => (d.data.count > 0 ? d.data.count.toString() : ''))
  }, [data])

  if (data.sites.length === 0) {
    return <div style={{ color: 'var(--color-text-muted)', height: 250 }}>No injection data available</div>
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
      <div ref={containerRef} style={{ flex: 1, maxWidth: 250 }}>
        <svg ref={svgRef} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {data.sites.map((site, i) => (
          <div key={site.site} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
              }}
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {site.site} ({site.count})
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================
// Dosage History Step Chart
// ============================================

function DosageHistoryChart({ data }: { data: DosageHistoryStats }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.points.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const containerWidth = containerRef.current.clientWidth
    const margin = { top: 20, right: 20, bottom: 40, left: 50 }
    const width = containerWidth - margin.left - margin.right
    const height = 200 - margin.top - margin.bottom

    svg.attr('width', containerWidth).attr('height', 200)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const sortedPoints = [...data.points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(sortedPoints, (d) => new Date(d.date)) as [Date, Date])
      .range([0, width])

    const dosageExtent = d3.extent(sortedPoints, (d) => d.dosageValue) as [number, number]
    const yPadding = (dosageExtent[1] - dosageExtent[0]) * 0.2 || 2
    const yScale = d3
      .scaleLinear()
      .domain([Math.max(0, dosageExtent[0] - yPadding), dosageExtent[1] + yPadding])
      .range([height, 0])

    g.append('g')
      .attr('opacity', 0.1)
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => ''),
      )
      .call((sel) => sel.select('.domain').remove())

    const line = d3
      .line<(typeof sortedPoints)[0]>()
      .x((d) => xScale(new Date(d.date)))
      .y((d) => yScale(d.dosageValue))
      .curve(d3.curveStepAfter)

    g.append('path')
      .datum(sortedPoints)
      .attr('fill', 'none')
      .attr('stroke', '#7c3aed')
      .attr('stroke-width', 2)
      .attr('d', line)

    g.selectAll('.point')
      .data(sortedPoints)
      .enter()
      .append('circle')
      .attr('cx', (d) => xScale(new Date(d.date)))
      .attr('cy', (d) => yScale(d.dosageValue))
      .attr('r', 5)
      .attr('fill', (d) => getDosageColor(d.dosage))
      .attr('stroke', 'var(--color-surface)')
      .attr('stroke-width', 2)

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickFormat(d3.timeFormat('%b %d') as (d: d3.NumberValue) => string),
      )
      .call((sel) => sel.select('.domain').attr('stroke', '#e5e7eb'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', '#e5e7eb'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', '#9ca3af').attr('font-size', '10px'))

    g.append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((d) => `${d}mg`),
      )
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .call((sel) => sel.selectAll('.tick text').attr('fill', '#9ca3af').attr('font-size', '10px'))
  }, [data])

  if (data.points.length === 0) {
    return <div style={{ color: 'var(--color-text-muted)', height: 200 }}>No dosage data available</div>
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg ref={svgRef} />
    </div>
  )
}

// ============================================
// Injection Frequency Stats
// ============================================

function InjectionFrequencySummary({ stats }: { stats: InjectionFrequencyStats | null }) {
  if (!stats) {
    return <div style={{ color: 'var(--color-text-muted)' }}>No injection data available</div>
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const mostFrequentDay =
    stats.mostFrequentDayOfWeek !== null ? (dayNames[stats.mostFrequentDayOfWeek] ?? 'Unknown') : 'N/A'

  const items = [
    { label: 'Total Injections', value: stats.totalInjections.toString() },
    { label: 'Avg Days Between', value: stats.avgDaysBetween.toFixed(1) },
    { label: 'Per Week', value: stats.injectionsPerWeek.toFixed(1) },
    { label: 'Most Common Day', value: mostFrequentDay },
  ]

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-4)' }}
    >
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{item.label}</div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Drug Breakdown Bar Chart
// ============================================

function DrugBreakdownChart({ data }: { data: DrugBreakdownStats }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.drugs.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const containerWidth = containerRef.current.clientWidth
    const margin = { top: 10, right: 20, bottom: 30, left: 100 }
    const barHeight = 30
    const height = data.drugs.length * barHeight + margin.top + margin.bottom
    const width = containerWidth - margin.left - margin.right

    svg.attr('width', containerWidth).attr('height', height)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xScale = d3
      .scaleLinear()
      .domain([0, d3.max(data.drugs, (d) => d.count) ?? 1])
      .range([0, width])

    const yScale = d3
      .scaleBand()
      .domain(data.drugs.map((d) => d.drug))
      .range([0, data.drugs.length * barHeight])
      .padding(0.2)

    const color = d3
      .scaleOrdinal<string>()
      .domain(data.drugs.map((d) => d.drug))
      .range(CHART_COLORS)

    g.selectAll('.bar')
      .data(data.drugs)
      .enter()
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => yScale(d.drug) ?? 0)
      .attr('width', (d) => xScale(d.count))
      .attr('height', yScale.bandwidth())
      .attr('fill', (d) => color(d.drug))
      .attr('rx', 4)

    g.selectAll('.label')
      .data(data.drugs)
      .enter()
      .append('text')
      .attr('x', (d) => xScale(d.count) + 8)
      .attr('y', (d) => (yScale(d.drug) ?? 0) + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('font-size', '12px')
      .attr('fill', 'var(--color-text-muted)')
      .text((d) => d.count.toString())

    g.append('g')
      .call(d3.axisLeft(yScale))
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--color-text)').attr('font-size', '12px'))
  }, [data])

  if (data.drugs.length === 0) {
    return <div style={{ color: 'var(--color-text-muted)', height: 100 }}>No drug data available</div>
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg ref={svgRef} />
    </div>
  )
}

// ============================================
// Stats Page Component
// ============================================

export function StatsPage({ userId }: { userId: string }) {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')
  const [zoomRange, setZoomRange] = useState<{ start: Date; end: Date } | null>(null)

  const { startDate, endDate } = useMemo(() => TIME_RANGES[timeRange].getRange(), [timeRange])

  // Reset zoom when time range changes
  const handleTimeRangeChange = (key: TimeRangeKey) => {
    setTimeRange(key)
    setZoomRange(null)
  }

  // Create atoms for all stats - use zoom range for stats when available
  const effectiveStartDate = zoomRange?.start ?? startDate
  const effectiveEndDate = zoomRange?.end ?? endDate

  const weightStatsAtom = useMemo(
    () => createWeightStatsAtom(effectiveStartDate, effectiveEndDate),
    [effectiveStartDate, effectiveEndDate],
  )
  const weightTrendAtom = useMemo(() => createWeightTrendAtom(startDate, endDate), [startDate, endDate])
  const injectionAtom = useMemo(
    () => createInjectionLogListAtom(userId, startDate, endDate),
    [userId, startDate, endDate],
  )
  const injectionSiteStatsAtom = useMemo(
    () => createInjectionSiteStatsAtom(effectiveStartDate, effectiveEndDate),
    [effectiveStartDate, effectiveEndDate],
  )
  const dosageHistoryAtom = useMemo(
    () => createDosageHistoryAtom(effectiveStartDate, effectiveEndDate),
    [effectiveStartDate, effectiveEndDate],
  )
  const injectionFrequencyAtom = useMemo(
    () => createInjectionFrequencyAtom(effectiveStartDate, effectiveEndDate),
    [effectiveStartDate, effectiveEndDate],
  )
  const drugBreakdownAtom = useMemo(
    () => createDrugBreakdownAtom(effectiveStartDate, effectiveEndDate),
    [effectiveStartDate, effectiveEndDate],
  )

  const weightStatsResult = useAtomValue(weightStatsAtom)
  const weightTrendResult = useAtomValue(weightTrendAtom)
  const injectionResult = useAtomValue(injectionAtom)
  const injectionSiteStatsResult = useAtomValue(injectionSiteStatsAtom)
  const dosageHistoryResult = useAtomValue(dosageHistoryAtom)
  const injectionFrequencyResult = useAtomValue(injectionFrequencyAtom)
  const drugBreakdownResult = useAtomValue(drugBreakdownAtom)

  const isLoading =
    Result.isWaiting(weightStatsResult) ||
    Result.isWaiting(weightTrendResult) ||
    Result.isWaiting(injectionResult) ||
    Result.isWaiting(injectionSiteStatsResult) ||
    Result.isWaiting(dosageHistoryResult) ||
    Result.isWaiting(injectionFrequencyResult) ||
    Result.isWaiting(drugBreakdownResult)

  const weightStats = Result.getOrElse(weightStatsResult, () => null as WeightStats | null)
  const weightTrend = Result.getOrElse(weightTrendResult, () => ({ points: [] }) as WeightTrendStats)
  const injections = Result.getOrElse(injectionResult, () => [] as InjectionLog[])
  const injectionSiteStats = Result.getOrElse(
    injectionSiteStatsResult,
    () => ({ sites: [], totalInjections: 0 }) as InjectionSiteStats,
  )
  const dosageHistory = Result.getOrElse(dosageHistoryResult, () => ({ points: [] }) as DosageHistoryStats)
  const injectionFrequency = Result.getOrElse(injectionFrequencyResult, () => null as InjectionFrequencyStats | null)
  const drugBreakdown = Result.getOrElse(
    drugBreakdownResult,
    () => ({ drugs: [], totalInjections: 0 }) as DrugBreakdownStats,
  )

  // Transform data for the weight chart
  const weightData = useMemo((): DataPoint[] => {
    return weightTrend.points.map((p) => ({
      date: new Date(p.date),
      weight: p.weight,
    }))
  }, [weightTrend])

  const injectionData = useMemo((): InjectionPoint[] => {
    return injections.map((inj) => ({
      date: new Date(inj.datetime),
      weight: 0, // Will be matched to closest weight point in chart
      dosage: inj.dosage,
      drug: inj.drug,
      injectionSite: inj.injectionSite,
      notes: inj.notes,
    }))
  }, [injections])

  if (isLoading) {
    return <div className="loading">Loading stats...</div>
  }

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <TimeRangeSelector
          selected={timeRange}
          onChange={handleTimeRangeChange}
          zoomRange={zoomRange}
          onResetZoom={() => setZoomRange(null)}
        />
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
        {/* Weight Statistics */}
        <StatCard title="Weight Statistics">
          <WeightSummary stats={weightStats} />
        </StatCard>

        {/* Weight Trend with Dosage Visualization */}
        <StatCard title="Weight Trend">
          {weightData.length > 0 ? (
            <WeightTrendChart
              weightData={weightData}
              injectionData={injectionData}
              zoomRange={zoomRange}
              onZoom={setZoomRange}
            />
          ) : (
            <div style={{ color: 'var(--color-text-muted)', height: 200 }}>No weight data available</div>
          )}
        </StatCard>

        {/* Injection Frequency */}
        <StatCard title="Injection Frequency">
          <InjectionFrequencySummary stats={injectionFrequency} />
        </StatCard>

        {/* Two column layout for smaller charts */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 'var(--space-5)',
          }}
        >
          {/* Injection Sites */}
          <StatCard title="Injection Sites">
            <InjectionSitePieChart data={injectionSiteStats} />
          </StatCard>

          {/* Drug Breakdown */}
          <StatCard title="Medications Used">
            <DrugBreakdownChart data={drugBreakdown} />
          </StatCard>
        </div>

        {/* Dosage History */}
        <StatCard title="Dosage History">
          <DosageHistoryChart data={dosageHistory} />
        </StatCard>
      </div>
    </div>
  )
}
