import { Result, useAtomValue } from '@effect-atom/atom-react'
import {
  Count,
  type DosageHistoryStats,
  type DrugBreakdownStats,
  type InjectionDayOfWeekStats,
  type InjectionFrequencyStats,
  type InjectionLog,
  type InjectionSchedule,
  type InjectionSiteStats,
  type WeightStats,
  type WeightTrendStats,
} from '@subq/shared'
import * as d3 from 'd3'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDateRangeParams } from '../../hooks/useDateRangeParams.js'
import {
  createDosageHistoryAtom,
  createDrugBreakdownAtom,
  createInjectionByDayOfWeekAtom,
  createInjectionFrequencyAtom,
  createInjectionLogListAtom,
  createInjectionSiteStatsAtom,
  createWeightStatsAtom,
  createWeightTrendAtom,
  ScheduleListAtom,
} from '../../rpc.js'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js'
import { type BarChartData, type PieChartData, SimpleHorizontalBarChart, SimplePieChart } from '../ui/chart.js'
import {
  CHART_COLORS,
  type DataPoint,
  getDosageColor,
  type InjectionPoint,
  TimeRangeSelector,
  Tooltip,
  useContainerSize,
  type WeightPointWithColor,
} from '../shared/chart-utils.js'

// ============================================
// Schedule Period Types
// ============================================

export interface SchedulePeriod {
  scheduleId: string
  scheduleName: string
  drug: string
  startDate: Date
  endDate: Date | null // null means ongoing
  phases: {
    order: number
    dosage: string
    startDate: Date
    endDate: Date | null
  }[]
}

/**
 * Compute the active periods for each schedule based on phases.
 * Each phase has a duration; phases are sequential starting from schedule.startDate.
 */
function computeSchedulePeriods(schedules: readonly InjectionSchedule[]): SchedulePeriod[] {
  return schedules.map((schedule) => {
    const phases: SchedulePeriod['phases'] = []
    let currentDate = new Date(schedule.startDate)

    const sortedPhases = [...schedule.phases].sort((a, b) => a.order - b.order)
    for (const phase of sortedPhases) {
      const phaseStart = new Date(currentDate)
      let phaseEnd: Date | null = null

      if (phase.durationDays !== null) {
        phaseEnd = new Date(phaseStart)
        phaseEnd.setDate(phaseEnd.getDate() + phase.durationDays)
        currentDate = phaseEnd
      }

      phases.push({
        order: phase.order,
        dosage: phase.dosage,
        startDate: phaseStart,
        endDate: phaseEnd,
      })
    }

    // Schedule end is the last phase's end, or null if indefinite
    const lastPhase = phases[phases.length - 1]
    const scheduleEnd = lastPhase?.endDate ?? null

    return {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      drug: schedule.drug,
      startDate: schedule.startDate,
      endDate: schedule.isActive ? null : scheduleEnd,
      phases,
    }
  })
}

// ============================================
// Weight Summary Stats
// ============================================

function WeightSummary({ stats }: { stats: WeightStats | null }) {
  if (!stats) {
    return <div className="text-muted-foreground">No weight data available</div>
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="text-lg font-semibold font-mono">{item.value}</div>
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
  schedulePeriods: SchedulePeriod[]
  zoomRange: { start: Date; end: Date } | null
  onZoom: (range: { start: Date; end: Date }) => void
}

function WeightTrendChart({ weightData, injectionData, schedulePeriods, zoomRange, onZoom }: WeightTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, width: containerWidth } = useContainerSize<HTMLDivElement>()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [selectedDosage, setSelectedDosage] = useState<string | null>(null)

  useEffect(() => {
    if (!svgRef.current || containerWidth === 0 || weightData.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const allSortedWeight = [...weightData].sort((a, b) => a.date.getTime() - b.date.getTime())
    const allSortedInjections = [...injectionData].sort((a, b) => a.date.getTime() - b.date.getTime())

    const sortedWeight = zoomRange
      ? allSortedWeight.filter((d) => d.date >= zoomRange.start && d.date <= zoomRange.end)
      : allSortedWeight
    const sortedInjections = zoomRange
      ? allSortedInjections.filter((d) => d.date >= zoomRange.start && d.date <= zoomRange.end)
      : allSortedInjections

    if (sortedWeight.length === 0) return

    const PILL_WIDTH_SINGLE = 44
    const PILL_HEIGHT = 18
    const MIN_GAP_X = 4
    const PILL_VERTICAL_GAP = 4

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

    // Responsive margins - smaller on mobile
    // Pills now render inside chart area, so we don't need extra top margin for rows
    const isSmallScreen = containerWidth < 400
    const margin = {
      top: 20,
      right: isSmallScreen ? 10 : 30,
      bottom: 40,
      left: isSmallScreen ? 35 : 60,
    }
    const width = containerWidth - margin.left - margin.right
    const totalHeight = 320
    const height = totalHeight - margin.top - margin.bottom

    svg.attr('width', containerWidth).attr('height', totalHeight)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(sortedWeight, (d) => d.date) as [Date, Date])
      .range([0, width])

    const weightExtent = d3.extent(sortedWeight, (d) => d.weight) as [number, number]
    const yPaddingBottom = (weightExtent[1] - weightExtent[0]) * 0.1 || 5
    // Reserve space at top for pill rows (each row ~22px, convert to data units)
    const pillSpacePixels = (maxRow + 1) * (PILL_HEIGHT + PILL_VERTICAL_GAP) + 20
    const pixelsPerUnit = height / (weightExtent[1] - weightExtent[0] + yPaddingBottom * 2 || 10)
    const yPaddingTop = pillSpacePixels / pixelsPerUnit
    const yScale = d3
      .scaleLinear()
      .domain([weightExtent[0] - yPaddingBottom, weightExtent[1] + yPaddingTop])
      .range([height, 0])

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

    const formatDate = d3.timeFormat('%b %d, %Y')
    const chartDomain = xScale.domain() as [Date, Date]

    // Schedule overlay background bands (non-interactive, just visual)
    const scheduleBackgroundGroup = g.append('g').attr('class', 'schedule-background')

    for (const schedule of schedulePeriods) {
      const scheduleStart = schedule.startDate
      const scheduleEnd = schedule.endDate ?? new Date()
      if (scheduleEnd < chartDomain[0] || scheduleStart > chartDomain[1]) continue

      const visibleStart = new Date(Math.max(scheduleStart.getTime(), chartDomain[0].getTime()))
      const visibleEnd = new Date(Math.min(scheduleEnd.getTime(), chartDomain[1].getTime()))

      const x1 = xScale(visibleStart)
      const x2 = xScale(visibleEnd)
      const bandWidth = x2 - x1

      if (bandWidth < 2) continue

      // Background band (no pointer events)
      scheduleBackgroundGroup
        .append('rect')
        .attr('x', x1)
        .attr('y', 0)
        .attr('width', bandWidth)
        .attr('height', height)
        .attr('fill', 'var(--foreground)')
        .attr('fill-opacity', 0.03)
        .attr('stroke', 'var(--foreground)')
        .attr('stroke-opacity', 0.08)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .style('pointer-events', 'none')

      // Schedule name label at bottom - use drug name which is shorter
      if (bandWidth > 40) {
        // Calculate max chars that fit (roughly 6px per char at 9px font)
        const maxChars = Math.floor(bandWidth / 6)
        const label = schedule.drug
        const displayLabel = label.length > maxChars ? `${label.slice(0, maxChars - 3)}...` : label

        scheduleBackgroundGroup
          .append('text')
          .attr('x', x1 + bandWidth / 2)
          .attr('y', height - 8)
          .attr('text-anchor', 'middle')
          .attr('fill', 'var(--muted-foreground)')
          .attr('font-size', '9px')
          .attr('opacity', 0.5)
          .style('pointer-events', 'none')
          .text(displayLabel)
      }
    }

    const weightPointsWithColors: WeightPointWithColor[] = sortedWeight.map((wp) => {
      const recentInjection = sortedInjections.filter((inj) => inj.date.getTime() <= wp.date.getTime()).pop()
      const color = recentInjection ? getDosageColor(recentInjection.dosage) : '#94a3b8'
      return { ...wp, color }
    })

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
      .attr('fill', 'var(--foreground)')
      .attr('fill-opacity', 0.1)
      .attr('stroke', 'var(--foreground)')
      .attr('stroke-opacity', 0.3)

    for (const segment of segments) {
      if (segment.points.length < 2) continue
      const isSegmentSelected = !selectedDosage || segment.color === getDosageColor(selectedDosage)
      g.append('path')
        .datum(segment.points)
        .attr('fill', 'none')
        .attr('stroke', segment.color)
        .attr('stroke-width', isSegmentSelected ? 2 : 1)
        .attr('opacity', isSegmentSelected ? 1 : 0.15)
        .attr('d', line)
    }

    g.selectAll('.weight-point')
      .data(weightPointsWithColors)
      .enter()
      .append('circle')
      .attr('class', 'weight-point')
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScale(d.weight))
      .attr('r', (d) => {
        const isSelected = !selectedDosage || d.color === getDosageColor(selectedDosage)
        return isSelected ? 4 : 2
      })
      .attr('fill', (d) => d.color)
      .attr('stroke', 'var(--card)')
      .attr('stroke-width', (d) => {
        const isSelected = !selectedDosage || d.color === getDosageColor(selectedDosage)
        return isSelected ? 2 : 1
      })
      .attr('opacity', (d) => {
        const isSelected = !selectedDosage || d.color === getDosageColor(selectedDosage)
        return isSelected ? 1 : 0.15
      })
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('r', 6)
        setTooltip({
          content: (
            <div>
              <div className="font-semibold mb-0.5">{d.weight} lbs</div>
              <div className="opacity-70">{formatDate(d.date)}</div>
              {d.notes && <div className="mt-1 opacity-80">{d.notes}</div>}
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

    // Pills render inside the chart area at the top
    const rowOffset = (row: number) => row * (PILL_HEIGHT + PILL_VERTICAL_GAP)

    // Track long-press state for mobile filter activation
    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    let longPressTriggered = false
    const LONG_PRESS_DURATION = 500 // ms

    const injectionGroup = g
      .selectAll('.injection-group')
      .data(dosageChanges)
      .enter()
      .append('g')
      .attr('class', 'injection-group')
      .attr('transform', (d) => `translate(${Math.max(PILL_WIDTH_SINGLE / 2, d.x)},${12 + rowOffset(d.row)})`)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        // On desktop (non-touch), click toggles filter
        // On mobile, only short taps show tooltip (long press filters)
        if (!longPressTriggered) {
          // Check if touch device - if so, show tooltip on tap instead of filtering
          if ('ontouchstart' in window) {
            // Mobile: tap shows tooltip, let long-press handle filter
            return
          }
          // Desktop: click toggles filter
          setSelectedDosage((prev) => (prev === d.item.dosage ? null : d.item.dosage))
          setTooltip(null)
        }
        longPressTriggered = false
      })
      .on('mouseenter', (event, d) => {
        setTooltip({
          content: (
            <div>
              <div className="font-semibold mb-0.5">Started {d.item.dosage}</div>
              <div className="opacity-70">{formatDate(d.item.displayDate)}</div>
              <div className="mt-1 text-[9px] opacity-60">{d.item.drug}</div>
              {!selectedDosage && <div className="mt-1 text-[9px] opacity-50">Click to filter</div>}
            </div>
          ),
          position: { x: event.clientX, y: event.clientY },
        })
      })
      .on('mousemove', (event) => {
        setTooltip((prev) => (prev ? { ...prev, position: { x: event.clientX, y: event.clientY } } : null))
      })
      .on('mouseleave', () => setTooltip(null))
      // Touch events for mobile: tap shows tooltip, long-press filters
      .on('touchstart', (event, d) => {
        event.preventDefault()
        longPressTriggered = false
        const touch = event.touches[0]
        // Show tooltip immediately on touch
        setTooltip({
          content: (
            <div>
              <div className="font-semibold mb-0.5">Started {d.item.dosage}</div>
              <div className="opacity-70">{formatDate(d.item.displayDate)}</div>
              <div className="mt-1 text-[9px] opacity-60">{d.item.drug}</div>
              {!selectedDosage && <div className="mt-1 text-[9px] opacity-50">Hold to filter</div>}
            </div>
          ),
          position: { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 },
        })
        // Start long-press timer for filter
        longPressTimer = setTimeout(() => {
          longPressTriggered = true
          setSelectedDosage((prev) => (prev === d.item.dosage ? null : d.item.dosage))
          setTooltip(null)
        }, LONG_PRESS_DURATION)
      })
      .on('touchend', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
        // Keep tooltip visible briefly after tap, then hide
        if (!longPressTriggered) {
          setTimeout(() => setTooltip(null), 1500)
        }
      })
      .on('touchmove', () => {
        // Cancel long-press if user moves finger
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
      })

    injectionGroup
      .append('rect')
      .attr('rx', 10)
      .attr('ry', 10)
      .attr('x', -PILL_WIDTH_SINGLE / 2)
      .attr('y', -10)
      .attr('width', PILL_WIDTH_SINGLE)
      .attr('height', PILL_HEIGHT)
      .attr('fill', (d) => d.item.color)
      .attr('opacity', (d) => {
        const isSelected = !selectedDosage || d.item.dosage === selectedDosage
        return isSelected ? 1 : 0.25
      })

    injectionGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('opacity', (d) => {
        const isSelected = !selectedDosage || d.item.dosage === selectedDosage
        return isSelected ? 1 : 0.4
      })
      .text((d) => d.item.dosage)

    g.selectAll('.injection-line')
      .data(dosageChanges)
      .enter()
      .append('line')
      .attr('class', 'injection-line')
      .attr('x1', (d) => Math.max(PILL_WIDTH_SINGLE / 2, d.x))
      .attr('x2', (d) => Math.max(PILL_WIDTH_SINGLE / 2, d.x))
      .attr('y1', (d) => 20 + rowOffset(d.row))
      .attr('y2', (d) => yScale(d.item.weight))
      .attr('stroke', (d) => d.item.color)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', (d) => {
        const isSelected = !selectedDosage || d.item.dosage === selectedDosage
        return isSelected ? 0.4 : 0.1
      })

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(isSmallScreen ? 3 : 5)
          .tickFormat(d3.timeFormat('%b %d') as (d: d3.NumberValue) => string),
      )
      .call((sel) => sel.select('.domain').attr('stroke', '#e5e7eb'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', '#e5e7eb'))
      .call((sel) =>
        sel
          .selectAll('.tick text')
          .attr('fill', '#9ca3af')
          .attr('font-size', isSmallScreen ? '9px' : '11px'),
      )

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(isSmallScreen ? 4 : 5))
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .call((sel) =>
        sel
          .selectAll('.tick text')
          .attr('fill', '#9ca3af')
          .attr('font-size', isSmallScreen ? '9px' : '11px'),
      )

    // Hide y-axis label on small screens to save space
    if (!isSmallScreen) {
      g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -40)
        .attr('x', -height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9ca3af')
        .attr('font-size', '11px')
        .text('Weight (lbs)')
    }

    // Interactive schedule hover zones at the bottom (rendered last to be on top)
    const HOVER_ZONE_HEIGHT = 24
    const scheduleHoverGroup = g.append('g').attr('class', 'schedule-hover')

    for (const schedule of schedulePeriods) {
      const scheduleStart = schedule.startDate
      const scheduleEnd = schedule.endDate ?? new Date()
      if (scheduleEnd < chartDomain[0] || scheduleStart > chartDomain[1]) continue

      const visibleStart = new Date(Math.max(scheduleStart.getTime(), chartDomain[0].getTime()))
      const visibleEnd = new Date(Math.min(scheduleEnd.getTime(), chartDomain[1].getTime()))

      const x1 = xScale(visibleStart)
      const x2 = xScale(visibleEnd)
      const bandWidth = x2 - x1

      if (bandWidth < 2) continue

      // Invisible hover zone at the bottom of the chart
      scheduleHoverGroup
        .append('rect')
        .attr('x', x1)
        .attr('y', height - HOVER_ZONE_HEIGHT)
        .attr('width', bandWidth)
        .attr('height', HOVER_ZONE_HEIGHT)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .on('mouseenter', (event) => {
          // Highlight the background band
          scheduleBackgroundGroup
            .selectAll('rect')
            .filter(function () {
              const rectX = Number.parseFloat(d3.select(this).attr('x'))
              return Math.abs(rectX - x1) < 1
            })
            .attr('fill-opacity', 0.08)
            .attr('stroke-opacity', 0.2)

          // Show all phases in the tooltip
          const phasesDisplay = schedule.phases.map((p) => p.dosage).join(' → ')
          setTooltip({
            content: (
              <div>
                <div className="font-semibold mb-1">{schedule.scheduleName}</div>
                <div className="text-[10px] opacity-80 mb-1">{schedule.drug}</div>
                <div className="text-[10px] opacity-70">
                  {formatDate(schedule.startDate)} — {schedule.endDate ? formatDate(schedule.endDate) : 'ongoing'}
                </div>
                <div className="mt-1.5 text-[10px] opacity-90">{phasesDisplay}</div>
              </div>
            ),
            position: { x: event.clientX, y: event.clientY },
          })
        })
        .on('mousemove', (event) => {
          setTooltip((prev) => (prev ? { ...prev, position: { x: event.clientX, y: event.clientY } } : null))
        })
        .on('mouseleave', () => {
          // Reset the background band
          scheduleBackgroundGroup
            .selectAll('rect')
            .filter(function () {
              const rectX = Number.parseFloat(d3.select(this).attr('x'))
              return Math.abs(rectX - x1) < 1
            })
            .attr('fill-opacity', 0.03)
            .attr('stroke-opacity', 0.08)
          setTooltip(null)
        })
    }
  }, [weightData, injectionData, schedulePeriods, zoomRange, onZoom, containerWidth, selectedDosage])

  return (
    <div ref={containerRef} className="relative w-full">
      <svg ref={svgRef} className="block cursor-crosshair" />
      <Tooltip content={tooltip?.content} position={tooltip?.position ?? null} />
      {selectedDosage && (
        <button
          type="button"
          onClick={() => setSelectedDosage(null)}
          className="absolute top-2 right-2 text-xs bg-muted/80 hover:bg-muted px-2 py-1 rounded-md text-muted-foreground"
        >
          Clear filter: {selectedDosage}
        </button>
      )}
      {!zoomRange && !selectedDosage && (
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground opacity-60">Drag to zoom</div>
      )}
    </div>
  )
}

// ============================================
// Injection Site Pie Chart
// ============================================

function InjectionSitePieChart({ data }: { data: InjectionSiteStats }) {
  const chartData: PieChartData[] = data.sites.map((site) => ({
    name: site.site,
    value: site.count,
  }))

  return <SimplePieChart data={chartData} colors={CHART_COLORS} />
}

// ============================================
// Dosage History Step Chart
// ============================================

interface DosagePointWithColor {
  date: Date
  dosage: string
  dosageValue: number
  color: string
}

function DosageHistoryChart({ data }: { data: DosageHistoryStats }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, width: containerWidth } = useContainerSize<HTMLDivElement>()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    if (!svgRef.current || containerWidth === 0 || data.points.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const margin = { top: 20, right: 20, bottom: 40, left: 50 }
    const width = containerWidth - margin.left - margin.right
    const height = 200 - margin.top - margin.bottom

    svg.attr('width', containerWidth).attr('height', 200)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const sortedPoints: DosagePointWithColor[] = [...data.points]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((p) => ({
        date: new Date(p.date),
        dosage: p.dosage,
        dosageValue: p.dosageValue,
        color: getDosageColor(p.dosage),
      }))

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(sortedPoints, (d) => d.date) as [Date, Date])
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

    const segments: { points: DosagePointWithColor[]; color: string }[] = []
    let currentSegment: DosagePointWithColor[] = []
    let currentColor = ''

    for (const point of sortedPoints) {
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
      .line<DosagePointWithColor>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.dosageValue))
      .curve(d3.curveStepAfter)

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

    g.selectAll('.point')
      .data(sortedPoints)
      .enter()
      .append('circle')
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScale(d.dosageValue))
      .attr('r', 4)
      .attr('fill', (d) => d.color)
      .attr('stroke', 'var(--card)')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('r', 6)
        setTooltip({
          content: (
            <div>
              <div className="font-semibold mb-0.5">{d.dosage}</div>
              <div className="opacity-70">{formatDate(d.date)}</div>
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
  }, [data, containerWidth])

  if (data.points.length === 0) {
    return <div className="text-muted-foreground h-[200px]">No dosage data available</div>
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg ref={svgRef} />
      <Tooltip content={tooltip?.content} position={tooltip?.position ?? null} />
    </div>
  )
}

// ============================================
// Injection Frequency Stats
// ============================================

function InjectionFrequencySummary({ stats }: { stats: InjectionFrequencyStats | null }) {
  if (!stats) {
    return <div className="text-muted-foreground">No injection data available</div>
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="text-lg font-semibold font-mono">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Drug Breakdown Bar Chart
// ============================================

function DrugBreakdownChart({ data }: { data: DrugBreakdownStats }) {
  const chartData: BarChartData[] = data.drugs.map((drug) => ({
    name: drug.drug,
    value: drug.count,
  }))

  return <SimpleHorizontalBarChart data={chartData} colors={CHART_COLORS} />
}

// ============================================
// Injection Day of Week Pie Chart
// ============================================

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function InjectionDayOfWeekPieChart({ data }: { data: InjectionDayOfWeekStats }) {
  const chartData: PieChartData[] = data.days.map((day) => ({
    name: DAY_NAMES[day.dayOfWeek] ?? 'Unknown',
    value: day.count,
  }))

  return <SimplePieChart data={chartData} colors={CHART_COLORS} />
}

// ============================================
// Stats Page Component
// ============================================

export function StatsPage() {
  const { range, setRange, setPreset, activePreset } = useDateRangeParams()

  const handleZoom = useCallback(
    (zoomRange: { start: Date; end: Date }) => {
      setRange({ start: zoomRange.start, end: zoomRange.end })
    },
    [setRange],
  )

  const weightStatsAtom = useMemo(() => createWeightStatsAtom(range.start, range.end), [range.start, range.end])
  const weightTrendAtom = useMemo(() => createWeightTrendAtom(range.start, range.end), [range.start, range.end])
  const injectionAtom = useMemo(() => createInjectionLogListAtom(range.start, range.end), [range.start, range.end])
  const injectionSiteStatsAtom = useMemo(
    () => createInjectionSiteStatsAtom(range.start, range.end),
    [range.start, range.end],
  )
  const dosageHistoryAtom = useMemo(() => createDosageHistoryAtom(range.start, range.end), [range.start, range.end])
  const injectionFrequencyAtom = useMemo(
    () => createInjectionFrequencyAtom(range.start, range.end),
    [range.start, range.end],
  )
  const drugBreakdownAtom = useMemo(() => createDrugBreakdownAtom(range.start, range.end), [range.start, range.end])
  const injectionByDayOfWeekAtom = useMemo(
    () => createInjectionByDayOfWeekAtom(range.start, range.end),
    [range.start, range.end],
  )

  const weightStatsResult = useAtomValue(weightStatsAtom)
  const weightTrendResult = useAtomValue(weightTrendAtom)
  const injectionResult = useAtomValue(injectionAtom)
  const injectionSiteStatsResult = useAtomValue(injectionSiteStatsAtom)
  const dosageHistoryResult = useAtomValue(dosageHistoryAtom)
  const injectionFrequencyResult = useAtomValue(injectionFrequencyAtom)
  const drugBreakdownResult = useAtomValue(drugBreakdownAtom)
  const injectionByDayOfWeekResult = useAtomValue(injectionByDayOfWeekAtom)
  const scheduleListResult = useAtomValue(ScheduleListAtom)

  const isLoading =
    Result.isWaiting(weightStatsResult) ||
    Result.isWaiting(weightTrendResult) ||
    Result.isWaiting(injectionResult) ||
    Result.isWaiting(injectionSiteStatsResult) ||
    Result.isWaiting(dosageHistoryResult) ||
    Result.isWaiting(injectionFrequencyResult) ||
    Result.isWaiting(drugBreakdownResult) ||
    Result.isWaiting(injectionByDayOfWeekResult)

  const weightStats = Result.getOrElse(weightStatsResult, () => null as WeightStats | null)
  const weightTrend = Result.getOrElse(weightTrendResult, () => ({ points: [] }) as WeightTrendStats)
  const injections = Result.getOrElse(injectionResult, () => [] as InjectionLog[])
  const injectionSiteStats = Result.getOrElse(
    injectionSiteStatsResult,
    () => ({ sites: [], totalInjections: Count.make(0) }) as InjectionSiteStats,
  )
  const dosageHistory = Result.getOrElse(dosageHistoryResult, () => ({ points: [] }) as DosageHistoryStats)
  const injectionFrequency = Result.getOrElse(injectionFrequencyResult, () => null as InjectionFrequencyStats | null)
  const drugBreakdown = Result.getOrElse(
    drugBreakdownResult,
    () => ({ drugs: [], totalInjections: Count.make(0) }) as DrugBreakdownStats,
  )
  const injectionByDayOfWeek = Result.getOrElse(
    injectionByDayOfWeekResult,
    () => ({ days: [], totalInjections: Count.make(0) }) as InjectionDayOfWeekStats,
  )
  const schedules = Result.getOrElse(scheduleListResult, () => [] as InjectionSchedule[])

  const schedulePeriods = useMemo(() => computeSchedulePeriods(schedules), [schedules])

  const weightData = useMemo((): DataPoint[] => {
    return weightTrend.points.map((p) => ({
      date: new Date(p.date),
      weight: p.weight,
    }))
  }, [weightTrend])

  const injectionData = useMemo((): InjectionPoint[] => {
    return injections.map((inj) => ({
      date: new Date(inj.datetime),
      weight: 0,
      dosage: inj.dosage,
      drug: inj.drug,
      injectionSite: inj.injectionSite,
      notes: inj.notes,
    }))
  }, [injections])

  const zoomRange = range.start && range.end && !activePreset ? { start: range.start, end: range.end } : null

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Loading stats...</div>
  }

  return (
    <div>
      <div className="mb-6">
        <TimeRangeSelector
          range={range}
          activePreset={activePreset}
          onPresetChange={setPreset}
          onRangeChange={setRange}
        />
      </div>

      <div className="grid gap-5">
        {/* Weight Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Weight Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <WeightSummary stats={weightStats} />
          </CardContent>
        </Card>

        {/* Weight Trend with Dosage Visualization */}
        <Card>
          <CardHeader>
            <CardTitle>Weight Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {weightData.length > 0 ? (
              <WeightTrendChart
                weightData={weightData}
                injectionData={injectionData}
                schedulePeriods={schedulePeriods}
                zoomRange={zoomRange}
                onZoom={handleZoom}
              />
            ) : (
              <div className="text-muted-foreground h-[200px]">No weight data available</div>
            )}
          </CardContent>
        </Card>

        {/* Injection Frequency */}
        <Card>
          <CardHeader>
            <CardTitle>Injection Frequency</CardTitle>
          </CardHeader>
          <CardContent>
            <InjectionFrequencySummary stats={injectionFrequency} />
          </CardContent>
        </Card>

        {/* Multi-column layout for smaller charts */}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {/* Injection Sites */}
          <Card>
            <CardHeader>
              <CardTitle>Injection Sites</CardTitle>
            </CardHeader>
            <CardContent>
              <InjectionSitePieChart data={injectionSiteStats} />
            </CardContent>
          </Card>

          {/* Injection Frequency by Day */}
          <Card>
            <CardHeader>
              <CardTitle>Injections by Day of Week</CardTitle>
            </CardHeader>
            <CardContent>
              <InjectionDayOfWeekPieChart data={injectionByDayOfWeek} />
            </CardContent>
          </Card>

          {/* Drug Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Medications Used</CardTitle>
            </CardHeader>
            <CardContent>
              <DrugBreakdownChart data={drugBreakdown} />
            </CardContent>
          </Card>
        </div>

        {/* Dosage History */}
        <Card>
          <CardHeader>
            <CardTitle>Dosage History</CardTitle>
          </CardHeader>
          <CardContent>
            <DosageHistoryChart data={dosageHistory} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
