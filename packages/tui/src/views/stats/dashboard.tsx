// Stats dashboard view showing key metrics

import { useKeyboard } from '@opentui/react'
import {
  type DrugBreakdownStats,
  type GoalProgress,
  type InjectionDayOfWeekStats,
  type InjectionFrequencyStats,
  type InjectionSiteStats,
  StatsParams,
  type WeightStats,
  type WeightTrendStats,
} from '@subq/shared'
// @ts-expect-error - no types available
import asciichart from 'asciichart'
import { DateTime } from 'effect'
import { useCallback, useEffect, useState } from 'react'
import { rpcCall } from '../../services/api-client'
import { theme } from '../../theme'

interface StatsDashboardProps {
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

interface StatsData {
  weight: WeightStats | null
  weightTrend: WeightTrendStats | null
  siteStats: InjectionSiteStats | null
  frequency: InjectionFrequencyStats | null
  drugBreakdown: DrugBreakdownStats | null
  dayOfWeek: InjectionDayOfWeekStats | null
  goalProgress: GoalProgress | null
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function StatsDashboard({ onMessage }: StatsDashboardProps) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<StatsData>({
    weight: null,
    weightTrend: null,
    siteStats: null,
    frequency: null,
    drugBreakdown: null,
    dayOfWeek: null,
    goalProgress: null,
  })

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const params = new StatsParams({})

      const [weight, weightTrend, siteStats, frequency, drugBreakdown, dayOfWeek, goalProgress] = await Promise.all([
        rpcCall((c) => c.GetWeightStats(params)),
        rpcCall((c) => c.GetWeightTrend(params)),
        rpcCall((c) => c.GetInjectionSiteStats(params)),
        rpcCall((c) => c.GetInjectionFrequency(params)),
        rpcCall((c) => c.GetDrugBreakdown(params)),
        rpcCall((c) => c.GetInjectionByDayOfWeek(params)),
        rpcCall((c) => c.GoalGetProgress()),
      ])

      setStats({ weight, weightTrend, siteStats, frequency, drugBreakdown, dayOfWeek, goalProgress })
    } catch (err) {
      onMessage(`Failed to load stats: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
    setLoading(false)
  }, [onMessage])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useKeyboard((key) => {
    if (key.name === 'r') {
      loadStats()
    }
  })

  if (loading) {
    return (
      <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
        <text fg={theme.textMuted}>Loading stats...</text>
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1 }}>
      {/* Goal Progress */}
      {stats.goalProgress && <GoalProgressCard progress={stats.goalProgress} />}

      {/* Two column layout: Chart left, Stats right */}
      <box style={{ flexDirection: 'row', flexGrow: 1, marginTop: 1 }}>
        {/* Left: Weight Trend Chart */}
        <box style={{ flexDirection: 'column', width: '55%' }}>
          {stats.weightTrend && stats.weightTrend.points.length > 0 ? (
            <WeightTrendChart trend={stats.weightTrend} weight={stats.weight} />
          ) : (
            <Section title="WEIGHT TREND" color={theme.tab3}>
              <text fg={theme.textMuted}>No weight data</text>
            </Section>
          )}

          {/* Day of Week */}
          {stats.dayOfWeek && stats.dayOfWeek.days.length > 0 && <DayOfWeekChart dayOfWeek={stats.dayOfWeek} />}
        </box>

        {/* Right: Stats panels */}
        <box style={{ flexDirection: 'column', width: '45%', paddingLeft: 1 }}>
          {/* Weight Stats */}
          <Section title="WEIGHT STATISTICS" color={theme.tab3}>
            {stats.weight ? (
              <box style={{ flexDirection: 'row', gap: 3 }}>
                <Stat label="Min" value={`${stats.weight.minWeight}`} unit="lbs" />
                <Stat label="Max" value={`${stats.weight.maxWeight}`} unit="lbs" />
                <Stat label="Avg" value={stats.weight.avgWeight.toFixed(1)} unit="lbs" />
                <Stat
                  label="Rate"
                  value={formatRate(stats.weight.rateOfChange)}
                  color={stats.weight.rateOfChange < 0 ? theme.success : theme.warning}
                />
              </box>
            ) : (
              <text fg={theme.textMuted}>No data</text>
            )}
          </Section>

          {/* Injection Frequency */}
          <Section title="INJECTION FREQUENCY" color={theme.tab1}>
            {stats.frequency ? (
              <box style={{ flexDirection: 'row', gap: 3 }}>
                <Stat label="Total" value={`${stats.frequency.totalInjections}`} />
                <Stat label="Per Week" value={stats.frequency.injectionsPerWeek.toFixed(1)} />
                <Stat label="Avg Gap" value={stats.frequency.avgDaysBetween.toFixed(1)} unit="days" />
                <Stat
                  label="Common"
                  value={
                    stats.frequency.mostFrequentDayOfWeek !== null
                      ? (DAY_NAMES[stats.frequency.mostFrequentDayOfWeek] ?? '-')
                      : '-'
                  }
                />
              </box>
            ) : (
              <text fg={theme.textMuted}>No data</text>
            )}
          </Section>

          {/* Injection Sites */}
          <Section title="INJECTION SITES" color={theme.tab2}>
            {stats.siteStats && stats.siteStats.sites.length > 0 ? (
              <SitesList siteStats={stats.siteStats} />
            ) : (
              <text fg={theme.textMuted}>No data</text>
            )}
          </Section>

          {/* Drugs Used */}
          <Section title="DRUGS USED" color={theme.tab4}>
            {stats.drugBreakdown && stats.drugBreakdown.drugs.length > 0 ? (
              <DrugsList drugBreakdown={stats.drugBreakdown} />
            ) : (
              <text fg={theme.textMuted}>No data</text>
            )}
          </Section>
        </box>
      </box>

      {/* Help */}
      <text fg={theme.textSubtle}>[r] refresh</text>
    </box>
  )
}

// Goal progress card
function GoalProgressCard({ progress }: { progress: GoalProgress }) {
  const pctComplete = Math.min(100, Math.max(0, progress.percentComplete))
  const barWidth = 60
  const filled = Math.round((pctComplete / 100) * barWidth)

  const paceColor =
    progress.paceStatus === 'ahead'
      ? theme.success
      : progress.paceStatus === 'on_track'
        ? theme.info
        : progress.paceStatus === 'behind'
          ? theme.warning
          : theme.error

  const paceLabel =
    progress.paceStatus === 'ahead'
      ? 'Ahead'
      : progress.paceStatus === 'on_track'
        ? 'On Track'
        : progress.paceStatus === 'behind'
          ? 'Behind'
          : 'Stalled'

  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <text fg={theme.accent}>
          <strong>GOAL PROGRESS</strong>
        </text>
        <text fg={paceColor}>[{paceLabel}]</text>
      </box>

      {/* Progress bar */}
      <box style={{ flexDirection: 'row', marginTop: 1 }}>
        <text fg={theme.textMuted}>{progress.goal.startingWeight} </text>
        <text fg={theme.success}>{'█'.repeat(filled)}</text>
        <text fg={theme.textSubtle}>{'░'.repeat(barWidth - filled)}</text>
        <text fg={theme.textMuted}> {progress.goal.goalWeight}</text>
        <text fg={theme.text}> {pctComplete.toFixed(0)}%</text>
      </box>

      {/* Stats row */}
      <box style={{ flexDirection: 'row', gap: 4, marginTop: 1 }}>
        <Stat label="Lost" value={progress.lbsLost.toFixed(1)} unit="lbs" color={theme.success} />
        <Stat label="To Go" value={progress.lbsRemaining.toFixed(1)} unit="lbs" />
        <Stat label="Rate" value={progress.avgLbsPerWeek.toFixed(2)} unit="lbs/wk" color={theme.info} />
        <Stat label="Days" value={`${progress.daysOnPlan}`} />
        <Stat label="Current" value={`${progress.currentWeight}`} unit="lbs" color={theme.accent} />
        {progress.projectedDate && <Stat label="Projected" value={formatUtcDate(progress.projectedDate)} />}
      </box>
    </box>
  )
}

// ASCII Weight trend chart using asciichart
function WeightTrendChart({ trend, weight }: { trend: WeightTrendStats; weight: WeightStats | null }) {
  const points = trend.points
  if (points.length < 2) return null

  const chartHeight = 15
  const chartWidth = 70

  // Sample points evenly across the full range to fit chart width
  const sampled: (typeof points)[number][] = []
  for (let i = 0; i < Math.min(chartWidth, points.length); i++) {
    const idx = Math.floor((i / (chartWidth - 1)) * (points.length - 1))
    const point = points[idx]
    if (point) sampled.push(point)
  }

  const firstPoint = sampled[0]
  const lastPoint = sampled[sampled.length - 1]
  if (!firstPoint || !lastPoint) return null

  // Get weights for chart
  const weights = sampled.map((p) => p.weight)

  // Generate chart using asciichart
  const chartStr: string = asciichart.plot(weights, {
    height: chartHeight,
    format: (x: number) => x.toFixed(0).padStart(6),
  })

  // Build date axis labels
  const chartLines = chartStr.split('\n')
  const midPoint = sampled[Math.floor(sampled.length / 2)]
  const midDate = midPoint ? formatDateWithYear(midPoint.date) : ''

  // Calculate chart dimensions - asciichart uses 7 chars for Y-axis label (6 digits + space)
  const yAxisWidth = 7
  const dataWidth = sampled.length // one char per data point
  const firstDateLabel = formatDateWithYear(firstPoint.date)
  const lastDateLabel = formatDateWithYear(lastPoint.date)

  // Build date axis string with proper spacing
  const totalAxisWidth = dataWidth
  const midDateStart = Math.floor((totalAxisWidth - midDate.length) / 2)
  const spaceBetweenFirstAndMid = Math.max(1, midDateStart - firstDateLabel.length)
  const spaceBetweenMidAndLast = Math.max(1, totalAxisWidth - midDateStart - midDate.length - lastDateLabel.length)
  const dateAxis =
    firstDateLabel + ' '.repeat(spaceBetweenFirstAndMid) + midDate + ' '.repeat(spaceBetweenMidAndLast) + lastDateLabel

  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <text fg={theme.tab3}>
          <strong>WEIGHT TREND</strong>
        </text>
        {weight && (
          <text fg={theme.textMuted}>
            {weight.minWeight} - {weight.maxWeight} lbs
          </text>
        )}
      </box>

      <box style={{ flexDirection: 'column', marginTop: 1 }}>
        {/* Chart lines */}
        {chartLines.map((line, i) => (
          <text key={i} fg={theme.info}>
            {line}
          </text>
        ))}
        {/* Date axis - padded to align with chart data area */}
        <text fg={theme.textMuted}>
          {' '.repeat(yAxisWidth)}
          {dateAxis}
        </text>
      </box>
    </box>
  )
}

// Day of week horizontal bar chart
function DayOfWeekChart({ dayOfWeek }: { dayOfWeek: InjectionDayOfWeekStats }) {
  const maxCount = Math.max(...dayOfWeek.days.map((d) => d.count), 1)
  const barMaxWidth = 40

  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        marginTop: 1,
      }}
    >
      <text fg={theme.accent}>
        <strong>INJECTIONS BY DAY</strong>
      </text>
      <box style={{ flexDirection: 'column', marginTop: 1 }}>
        {DAY_NAMES.map((name, idx) => {
          const dayData = dayOfWeek.days.find((d) => d.dayOfWeek === idx)
          const count = dayData?.count ?? 0
          const barLen = Math.round((count / maxCount) * barMaxWidth)
          return (
            <box key={name} style={{ flexDirection: 'row' }}>
              <text fg={theme.textMuted}>{name} </text>
              {count > 0 && <text fg={theme.accent}>{'█'.repeat(barLen) || '▏'}</text>}
              <text fg={theme.text}> {count}</text>
            </box>
          )
        })}
      </box>
    </box>
  )
}

// Section wrapper
function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        marginBottom: 1,
      }}
    >
      <text fg={color}>
        <strong>{title}</strong>
      </text>
      <box style={{ marginTop: 1 }}>{children}</box>
    </box>
  )
}

// Single stat display
function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <box style={{ flexDirection: 'column' }}>
      <text fg={theme.textMuted}>{label}</text>
      <box style={{ flexDirection: 'row' }}>
        <text fg={color ?? theme.text}>{value}</text>
        {unit && <text fg={theme.textMuted}> {unit}</text>}
      </box>
    </box>
  )
}

// Helpers
function formatRate(rate: number): string {
  const sign = rate >= 0 ? '+' : ''
  return `${sign}${rate.toFixed(2)}`
}

function formatDateWithYear(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear().toString().slice(-2) // "24" or "25"
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` '${year}`
}

function formatUtcDate(utc: DateTime.Utc): string {
  const d = new Date(DateTime.toEpochMillis(utc))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function padRight(s: string, len: number): string {
  if (s.length > len) {
    return s.slice(0, len - 1) + '…'
  }
  return s + ' '.repeat(len - s.length)
}

function pct(n: number, total: number): number {
  return Math.round((n / total) * 100)
}

// Sites list component
function SitesList({ siteStats }: { siteStats: InjectionSiteStats }) {
  return (
    <box style={{ flexDirection: 'column' }}>
      {siteStats.sites.slice(0, 5).map((site) => (
        <box key={site.site} style={{ flexDirection: 'row' }}>
          <text fg={theme.textMuted}>{padRight(site.site, 18)}</text>
          <text fg={theme.accent}>{'█'.repeat(Math.round((site.count / siteStats.totalInjections) * 15))}</text>
          <text fg={theme.text}> {pct(site.count, siteStats.totalInjections)}%</text>
        </box>
      ))}
    </box>
  )
}

// Drugs list component
function DrugsList({ drugBreakdown }: { drugBreakdown: DrugBreakdownStats }) {
  return (
    <box style={{ flexDirection: 'column' }}>
      {drugBreakdown.drugs.slice(0, 5).map((drug) => (
        <box key={drug.drug} style={{ flexDirection: 'row' }}>
          <text fg={theme.textMuted}>{padRight(drug.drug, 22)}</text>
          <text fg={theme.accent}>{'█'.repeat(Math.round((drug.count / drugBreakdown.totalInjections) * 15))}</text>
          <text fg={theme.text}> {pct(drug.count, drugBreakdown.totalInjections)}%</text>
        </box>
      ))}
    </box>
  )
}
