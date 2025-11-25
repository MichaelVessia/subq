import { useEffect, useRef, useMemo, useState } from 'react'
import { Result, useAtomValue } from '@effect-atom/atom-react'
import * as d3 from 'd3'
import {
  createWeightStatsAtom,
  createWeightTrendAtom,
  createInjectionSiteStatsAtom,
  createDosageHistoryAtom,
  createInjectionFrequencyAtom,
  createDrugBreakdownAtom,
} from '../../rpc.js'
import type {
  WeightStats,
  WeightTrendStats,
  InjectionSiteStats,
  DosageHistoryStats,
  InjectionFrequencyStats,
  DrugBreakdownStats,
} from '@scale/shared'

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
// Color palette
// ============================================

const CHART_COLORS = [
  '#0891b2', // cyan
  '#059669', // emerald
  '#7c3aed', // violet
  '#be185d', // pink
  '#64748b', // slate
  '#f59e0b', // amber
  '#10b981', // green
  '#6366f1', // indigo
]

const DOSAGE_COLORS: Record<string, string> = {
  '2.5mg': '#64748b',
  '5mg': '#0891b2',
  '7.5mg': '#0d9488',
  '10mg': '#059669',
  '12.5mg': '#7c3aed',
  '15mg': '#be185d',
}

function getDosageColor(dosage: string): string {
  return DOSAGE_COLORS[dosage] ?? '#64748b'
}

// ============================================
// Time Range Selector
// ============================================

function TimeRangeSelector({ selected, onChange }: { selected: TimeRangeKey; onChange: (key: TimeRangeKey) => void }) {
  const keys = Object.keys(TIME_RANGES) as TimeRangeKey[]
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
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

  const items = [
    { label: 'Min', value: `${stats.minWeight.toFixed(1)} lbs` },
    { label: 'Max', value: `${stats.maxWeight.toFixed(1)} lbs` },
    { label: 'Average', value: `${stats.avgWeight.toFixed(1)} lbs` },
    { label: 'Std Dev', value: `${stats.stdDev.toFixed(2)} lbs` },
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
// Weight Trend Line Chart
// ============================================

function WeightTrendChart({ data }: { data: WeightTrendStats }) {
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

    const weightExtent = d3.extent(sortedPoints, (d) => d.weight) as [number, number]
    const yPadding = (weightExtent[1] - weightExtent[0]) * 0.1 || 5
    const yScale = d3
      .scaleLinear()
      .domain([weightExtent[0] - yPadding, weightExtent[1] + yPadding])
      .range([height, 0])

    // Grid
    g.append('g')
      .attr('opacity', 0.1)
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => ''),
      )
      .call((g) => g.select('.domain').remove())

    // Line
    const line = d3
      .line<(typeof sortedPoints)[0]>()
      .x((d) => xScale(new Date(d.date)))
      .y((d) => yScale(d.weight))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(sortedPoints)
      .attr('fill', 'none')
      .attr('stroke', '#0891b2')
      .attr('stroke-width', 2)
      .attr('d', line)

    // Points
    g.selectAll('.point')
      .data(sortedPoints)
      .enter()
      .append('circle')
      .attr('cx', (d) => xScale(new Date(d.date)))
      .attr('cy', (d) => yScale(d.weight))
      .attr('r', 3)
      .attr('fill', '#0891b2')

    // Axes
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
      .call((g) => g.selectAll('.tick text').attr('fill', '#9ca3af').attr('font-size', '10px'))

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line').remove())
      .call((g) => g.selectAll('.tick text').attr('fill', '#9ca3af').attr('font-size', '10px'))
  }, [data])

  if (data.points.length === 0) {
    return <div style={{ color: 'var(--color-text-muted)', height: 200 }}>No weight data available</div>
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg ref={svgRef} />
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

    // Labels
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

    // Grid
    g.append('g')
      .attr('opacity', 0.1)
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => ''),
      )
      .call((g) => g.select('.domain').remove())

    // Step line
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

    // Points with dosage-specific colors
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

    // Axes
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
      .call((g) => g.selectAll('.tick text').attr('fill', '#9ca3af').attr('font-size', '10px'))

    g.append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((d) => `${d}mg`),
      )
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line').remove())
      .call((g) => g.selectAll('.tick text').attr('fill', '#9ca3af').attr('font-size', '10px'))
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

    // Labels
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

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale))
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line').remove())
      .call((g) => g.selectAll('.tick text').attr('fill', 'var(--color-text)').attr('font-size', '12px'))
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

export function StatsPage() {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')
  const { startDate, endDate } = useMemo(() => TIME_RANGES[timeRange].getRange(), [timeRange])

  // Create atoms for all stats
  const weightStatsAtom = useMemo(() => createWeightStatsAtom(startDate, endDate), [startDate, endDate])
  const weightTrendAtom = useMemo(() => createWeightTrendAtom(startDate, endDate), [startDate, endDate])
  const injectionSiteStatsAtom = useMemo(() => createInjectionSiteStatsAtom(startDate, endDate), [startDate, endDate])
  const dosageHistoryAtom = useMemo(() => createDosageHistoryAtom(startDate, endDate), [startDate, endDate])
  const injectionFrequencyAtom = useMemo(() => createInjectionFrequencyAtom(startDate, endDate), [startDate, endDate])
  const drugBreakdownAtom = useMemo(() => createDrugBreakdownAtom(startDate, endDate), [startDate, endDate])

  const weightStatsResult = useAtomValue(weightStatsAtom)
  const weightTrendResult = useAtomValue(weightTrendAtom)
  const injectionSiteStatsResult = useAtomValue(injectionSiteStatsAtom)
  const dosageHistoryResult = useAtomValue(dosageHistoryAtom)
  const injectionFrequencyResult = useAtomValue(injectionFrequencyAtom)
  const drugBreakdownResult = useAtomValue(drugBreakdownAtom)

  const isLoading =
    Result.isWaiting(weightStatsResult) ||
    Result.isWaiting(weightTrendResult) ||
    Result.isWaiting(injectionSiteStatsResult) ||
    Result.isWaiting(dosageHistoryResult) ||
    Result.isWaiting(injectionFrequencyResult) ||
    Result.isWaiting(drugBreakdownResult)

  const weightStats = Result.getOrElse(weightStatsResult, () => null as WeightStats | null)
  const weightTrend = Result.getOrElse(weightTrendResult, () => ({ points: [] }) as WeightTrendStats)
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

  if (isLoading) {
    return <div className="loading">Loading stats...</div>
  }

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <TimeRangeSelector selected={timeRange} onChange={setTimeRange} />
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
        {/* Weight Statistics */}
        <StatCard title="Weight Statistics">
          <WeightSummary stats={weightStats} />
        </StatCard>

        {/* Weight Trend */}
        <StatCard title="Weight Trend">
          <WeightTrendChart data={weightTrend} />
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
