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
import { useContainerSize } from '../../hooks/use-container-size.js'
import { useDateRangeParams } from '../../hooks/use-date-range-params.js'
import { useUserSettings } from '../../hooks/use-user-settings.js'
import { toDate } from '../../lib/utils.js'
import {
  dateRangeKey,
  DosageHistoryAtomFamily,
  DrugBreakdownAtomFamily,
  InjectionByDayOfWeekAtomFamily,
  InjectionFrequencyAtomFamily,
  InjectionLogListAtomFamily,
  InjectionSiteStatsAtomFamily,
  ScheduleListAtom,
  WeightStatsAtomFamily,
  WeightTrendAtomFamily,
} from '../../rpc.js'
import { GoalProgressCard } from '../goals/goal-progress.js'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js'
import { type BarChartData, type PieChartData, SimpleHorizontalBarChart, SimplePieChart } from '../ui/chart.js'
import { DatabaseError, UnauthorizedRedirect } from '../ui/error-states.js'
import { ChartSkeleton } from '../ui/skeleton.js'
import { CHART_COLORS, getDosageColor } from './chart-colors.js'
import type { DataPoint, InjectionPoint } from './chart-types.js'
import { TimeRangeSelector } from './time-range-selector.js'
import { Tooltip } from './tooltip.js'
import { WeightTrendChartWithErrorBoundary } from './weight-trend-chart/index.js'
import type { SchedulePeriod, TooltipState } from './weight-trend-chart/types.js'

// ============================================
// Schedule Period Computation
// ============================================

/**
 * Compute the active periods for each schedule based on phases.
 * Each phase has a duration; phases are sequential starting from schedule.startDate.
 */
function computeSchedulePeriods(schedules: readonly InjectionSchedule[]): SchedulePeriod[] {
  return schedules.map((schedule) => {
    const phases: SchedulePeriod['phases'] = []
    let currentDate = toDate(schedule.startDate)

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
      startDate: toDate(schedule.startDate),
      endDate: schedule.isActive ? null : scheduleEnd,
      phases,
    }
  })
}

// ============================================
// Weight Summary Stats
// ============================================

interface WeightSummaryProps {
  stats: WeightStats | null
  displayWeight: (lbs: number) => number
  unitLabel: string
}

function WeightSummary({ stats, displayWeight, unitLabel }: WeightSummaryProps) {
  if (!stats) {
    return <div className="text-muted-foreground">No weight data available</div>
  }

  const rateSign = stats.rateOfChange >= 0 ? '+' : ''
  // Convert rate of change to display unit (rate is in lbs/week)
  const displayRate = displayWeight(Math.abs(stats.rateOfChange))
  const items = [
    { label: 'Min', value: `${displayWeight(stats.minWeight).toFixed(1)} ${unitLabel}` },
    { label: 'Max', value: `${displayWeight(stats.maxWeight).toFixed(1)} ${unitLabel}` },
    { label: 'Average', value: `${displayWeight(stats.avgWeight).toFixed(1)} ${unitLabel}` },
    { label: 'Rate', value: `${rateSign}${displayRate.toFixed(2)} ${unitLabel}/wk` },
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
  drug: string
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
        drug: p.drug,
        dosage: p.dosage,
        dosageValue: p.dosageValue,
        color: getDosageColor(`${p.drug}::${p.dosage}`),
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
              <div className="font-semibold mb-0.5">
                {d.drug} {d.dosage}
              </div>
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
  const { displayWeight, unitLabel } = useUserSettings()

  const handleZoom = useCallback(
    (zoomRange: { start: Date; end: Date }) => {
      setRange({ start: zoomRange.start, end: zoomRange.end })
    },
    [setRange],
  )

  // Create a stable key for atom families based on the date range
  const rangeKey = dateRangeKey(range.start, range.end)

  // Use atom families instead of useMemo factory functions
  const weightStatsResult = useAtomValue(WeightStatsAtomFamily(rangeKey))
  const weightTrendResult = useAtomValue(WeightTrendAtomFamily(rangeKey))
  const injectionResult = useAtomValue(InjectionLogListAtomFamily(rangeKey))
  const injectionSiteStatsResult = useAtomValue(InjectionSiteStatsAtomFamily(rangeKey))
  const dosageHistoryResult = useAtomValue(DosageHistoryAtomFamily(rangeKey))
  const injectionFrequencyResult = useAtomValue(InjectionFrequencyAtomFamily(rangeKey))
  const drugBreakdownResult = useAtomValue(DrugBreakdownAtomFamily(rangeKey))
  const injectionByDayOfWeekResult = useAtomValue(InjectionByDayOfWeekAtomFamily(rangeKey))
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
  const weightTrend = Result.getOrElse(weightTrendResult, () => ({ points: [], trendLine: null }) as WeightTrendStats)
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
      date: toDate(inj.datetime),
      weight: 0,
      dosage: inj.dosage,
      drug: inj.drug,
      injectionSite: inj.injectionSite,
      notes: inj.notes,
    }))
  }, [injections])

  const zoomRange = range.start && range.end && !activePreset ? { start: range.start, end: range.end } : null

  // Combine key results to check for errors - use Result.all for type-safe combination
  const combinedResult = Result.all([
    weightStatsResult,
    weightTrendResult,
    injectionResult,
    injectionSiteStatsResult,
    dosageHistoryResult,
    injectionFrequencyResult,
    drugBreakdownResult,
    injectionByDayOfWeekResult,
  ])

  // Check for auth errors first (handles unauthorized before other errors)
  const authError = Result.builder(combinedResult)
    .onErrorTag('Unauthorized', () => <UnauthorizedRedirect />)
    .orNull()

  if (authError) return authError

  // Show loading skeleton while data is being fetched
  if (isLoading) {
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
          <ChartSkeleton height={150} />
          <ChartSkeleton height={320} />
          <ChartSkeleton height={150} />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <ChartSkeleton height={200} />
            <ChartSkeleton height={200} />
            <ChartSkeleton height={200} />
          </div>
          <ChartSkeleton height={200} />
        </div>
      </div>
    )
  }

  // Check for database errors after loading
  const dbError = Result.builder(combinedResult)
    .onError(() => <DatabaseError />)
    .orNull()

  if (dbError) return dbError

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
        {/* Goal Progress - placed first for prominence */}
        <GoalProgressCard />

        {/* Weight Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Weight Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <WeightSummary stats={weightStats} displayWeight={displayWeight} unitLabel={unitLabel} />
          </CardContent>
        </Card>

        {/* Weight Trend with Dosage Visualization */}
        <Card>
          <CardHeader>
            <CardTitle>Weight Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {weightData.length > 0 ? (
              <WeightTrendChartWithErrorBoundary
                weightData={weightData}
                injectionData={injectionData}
                schedulePeriods={schedulePeriods}
                trendLine={weightTrend.trendLine}
                zoomRange={zoomRange}
                onZoom={handleZoom}
                displayWeight={displayWeight}
                unitLabel={unitLabel}
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
