// Stats dashboard view showing key metrics

import { useKeyboard, useTerminalDimensions } from '@opentui/react'
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

// Width threshold below which we switch to single-column layout
const SINGLE_COLUMN_THRESHOLD = 100

export function StatsDashboard({ onMessage }: StatsDashboardProps) {
  const { width: termWidth } = useTerminalDimensions()
  const singleColumn = termWidth < SINGLE_COLUMN_THRESHOLD

  const [loading, setLoading] = useState(true)
  const [selectedSection, setSelectedSection] = useState(0)
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

  // Build section list for single-column navigation
  const sectionCount = singleColumn
    ? [
        stats.goalProgress ? 1 : 0, // Goal Progress
        1, // Weight Trend
        1, // Weight Statistics
        1, // Injection Frequency
        stats.dayOfWeek && stats.dayOfWeek.days.length > 0 ? 1 : 0, // Day of Week
        1, // Injection Sites
        1, // Drugs Used
      ].reduce((a, b) => a + b, 0)
    : 0

  useKeyboard((key) => {
    if (key.name === 'r') {
      loadStats()
    }
    // Section navigation only in single-column mode
    if (singleColumn && sectionCount > 0) {
      if (key.name === 'j' || key.name === 'down') {
        setSelectedSection((i) => Math.min(i + 1, sectionCount - 1))
      } else if (key.name === 'k' || key.name === 'up') {
        setSelectedSection((i) => Math.max(i - 1, 0))
      } else if (key.name === 'g' && !key.shift) {
        setSelectedSection(0)
      } else if (key.shift && key.name === 'g') {
        setSelectedSection(sectionCount - 1)
      } else if (key.ctrl && key.name === 'd') {
        setSelectedSection((i) => Math.min(i + 3, sectionCount - 1))
      } else if (key.ctrl && key.name === 'u') {
        setSelectedSection((i) => Math.max(i - 3, 0))
      }
    }
  })

  if (loading) {
    return (
      <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
        <text fg={theme.textMuted}>Loading stats...</text>
      </box>
    )
  }

  // Reusable weight stats section
  const weightStatsSection = (
    <Section title="WEIGHT STATISTICS" color={theme.tab3}>
      {stats.weight ? (
        <box style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap' }}>
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
  )

  const frequencySection = (
    <Section title="INJECTION FREQUENCY" color={theme.tab1}>
      {stats.frequency ? (
        <box style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap' }}>
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
  )

  const sitesSection = (
    <Section title="INJECTION SITES" color={theme.tab2}>
      {stats.siteStats && stats.siteStats.sites.length > 0 ? (
        <SitesList siteStats={stats.siteStats} />
      ) : (
        <text fg={theme.textMuted}>No data</text>
      )}
    </Section>
  )

  const drugsSection = (
    <Section title="DRUGS USED" color={theme.tab4}>
      {stats.drugBreakdown && stats.drugBreakdown.drugs.length > 0 ? (
        <DrugsList drugBreakdown={stats.drugBreakdown} />
      ) : (
        <text fg={theme.textMuted}>No data</text>
      )}
    </Section>
  )

  const weightTrendSection =
    stats.weightTrend && stats.weightTrend.points.length > 0 ? (
      <WeightTrendChart trend={stats.weightTrend} containerWidthPct={singleColumn ? 1.0 : 0.55} />
    ) : (
      <Section title="WEIGHT TREND" color={theme.tab3}>
        <text fg={theme.textMuted}>No weight data</text>
      </Section>
    )

  const dayOfWeekSection =
    stats.dayOfWeek && stats.dayOfWeek.days.length > 0 ? <DayOfWeekChart dayOfWeek={stats.dayOfWeek} /> : null

  if (singleColumn) {
    // Build sections array with proper index tracking for navigation
    const sections: React.ReactNode[] = []
    let idx = 0

    if (stats.goalProgress) {
      sections.push(<GoalProgressCard key="goal" progress={stats.goalProgress} isSelected={selectedSection === idx} />)
      idx++
    }

    sections.push(
      stats.weightTrend && stats.weightTrend.points.length > 0 ? (
        <WeightTrendChart
          key="trend"
          trend={stats.weightTrend}
          containerWidthPct={1.0}
          isSelected={selectedSection === idx}
        />
      ) : (
        <Section key="trend" title="WEIGHT TREND" color={theme.tab3} isSelected={selectedSection === idx}>
          <text fg={theme.textMuted}>No weight data</text>
        </Section>
      ),
    )
    idx++

    sections.push(
      <Section key="weight" title="WEIGHT STATISTICS" color={theme.tab3} isSelected={selectedSection === idx}>
        {stats.weight ? (
          <box style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap' }}>
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
      </Section>,
    )
    idx++

    sections.push(
      <Section key="freq" title="INJECTION FREQUENCY" color={theme.tab1} isSelected={selectedSection === idx}>
        {stats.frequency ? (
          <box style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap' }}>
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
      </Section>,
    )
    idx++

    if (stats.dayOfWeek && stats.dayOfWeek.days.length > 0) {
      sections.push(<DayOfWeekChart key="dow" dayOfWeek={stats.dayOfWeek} isSelected={selectedSection === idx} />)
      idx++
    }

    sections.push(
      <Section key="sites" title="INJECTION SITES" color={theme.tab2} isSelected={selectedSection === idx}>
        {stats.siteStats && stats.siteStats.sites.length > 0 ? (
          <SitesList siteStats={stats.siteStats} />
        ) : (
          <text fg={theme.textMuted}>No data</text>
        )}
      </Section>,
    )
    idx++

    sections.push(
      <Section key="drugs" title="DRUGS USED" color={theme.tab4} isSelected={selectedSection === idx}>
        {stats.drugBreakdown && stats.drugBreakdown.drugs.length > 0 ? (
          <DrugsList drugBreakdown={stats.drugBreakdown} />
        ) : (
          <text fg={theme.textMuted}>No data</text>
        )}
      </Section>,
    )

    // Single column: stack everything vertically with scroll
    return (
      <box style={{ flexDirection: 'column', flexGrow: 1 }}>
        <box style={{ flexDirection: 'column', flexGrow: 1, overflow: 'scroll' }}>{sections}</box>
        <text fg={theme.textSubtle}>[j/k] navigate [r] refresh</text>
      </box>
    )
  }

  // Two column layout
  return (
    <box style={{ flexDirection: 'column', flexGrow: 1 }}>
      {stats.goalProgress && <GoalProgressCard progress={stats.goalProgress} />}

      <box style={{ flexDirection: 'row', flexGrow: 1, marginTop: 1 }}>
        {/* Left: Weight Trend Chart */}
        <box style={{ flexDirection: 'column', width: '55%' }}>
          {weightTrendSection}
          {dayOfWeekSection}
        </box>

        {/* Right: Stats panels */}
        <box style={{ flexDirection: 'column', width: '45%', paddingLeft: 1 }}>
          {weightStatsSection}
          {frequencySection}
          {sitesSection}
          {drugsSection}
        </box>
      </box>

      <text fg={theme.textSubtle}>[r] refresh</text>
    </box>
  )
}

// Goal progress card
function GoalProgressCard({ progress, isSelected = false }: { progress: GoalProgress; isSelected?: boolean }) {
  const { width: termWidth } = useTerminalDimensions()
  const pctComplete = Math.min(100, Math.max(0, progress.percentComplete))
  // Responsive bar width: full width minus border (2), padding (2), labels (~20), and percentage (~5)
  const barWidth = Math.max(20, termWidth - 30)
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
        borderColor: isSelected ? theme.accent : theme.border,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <box style={{ flexDirection: 'row' }}>
          {isSelected && <text fg={theme.accent}>▶ </text>}
          <text fg={theme.accent}>
            <strong>GOAL PROGRESS</strong>
          </text>
        </box>
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
      <box style={{ flexDirection: 'row', gap: 4, marginTop: 1, flexWrap: 'wrap' }}>
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

// Sparkline weight trend using Unicode block characters
const SPARKLINE_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

function WeightTrendChart({
  trend,
  containerWidthPct,
  isSelected = false,
}: {
  trend: WeightTrendStats
  containerWidthPct: number
  isSelected?: boolean
}) {
  const { width: termWidth } = useTerminalDimensions()
  const points = trend.points
  if (points.length < 2) return null

  // Calculate available width for sparkline
  const containerWidth = Math.floor(termWidth * containerWidthPct) - 4
  const sparklineWidth = Math.max(10, containerWidth)

  // Sample points evenly across the full range to fit available width
  const sampled: (typeof points)[number][] = []
  for (let i = 0; i < Math.min(sparklineWidth, points.length); i++) {
    const idx = Math.floor((i / (sparklineWidth - 1)) * (points.length - 1))
    const point = points[idx]
    if (point) sampled.push(point)
  }

  const firstPoint = sampled[0]
  const lastPoint = sampled[sampled.length - 1]
  if (!firstPoint || !lastPoint) return null

  // Get weight range for scaling
  const weights = sampled.map((p) => p.weight)
  const minWeight = Math.min(...weights)
  const maxWeight = Math.max(...weights)
  const range = maxWeight - minWeight || 1

  // Build sparkline string
  const sparkline = weights
    .map((w) => {
      const normalized = (w - minWeight) / range
      const blockIndex = Math.min(Math.floor(normalized * SPARKLINE_BLOCKS.length), SPARKLINE_BLOCKS.length - 1)
      return SPARKLINE_BLOCKS[blockIndex]
    })
    .join('')

  // Date labels
  const firstDateLabel = formatDateWithYear(firstPoint.date)
  const lastDateLabel = formatDateWithYear(lastPoint.date)
  const dateWidth = sampled.length
  const minLabelWidth = firstDateLabel.length + lastDateLabel.length + 1

  let dateAxis: string
  if (dateWidth >= minLabelWidth) {
    const spaceBetween = dateWidth - firstDateLabel.length - lastDateLabel.length
    dateAxis = firstDateLabel + ' '.repeat(Math.max(1, spaceBetween)) + lastDateLabel
  } else {
    dateAxis = lastDateLabel.padStart(dateWidth)
  }

  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: isSelected ? theme.accent : theme.border,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <box style={{ flexDirection: 'row' }}>
          {isSelected && <text fg={theme.accent}>▶ </text>}
          <text fg={theme.tab3}>
            <strong>WEIGHT TREND</strong>
          </text>
        </box>
        <text fg={theme.textMuted}>
          {firstPoint.weight} → {lastPoint.weight} lbs
        </text>
      </box>

      <box style={{ flexDirection: 'column', marginTop: 1 }}>
        <text fg={theme.info}>{sparkline}</text>
        <text fg={theme.textMuted}>{dateAxis}</text>
      </box>
    </box>
  )
}

// Day of week horizontal bar chart
function DayOfWeekChart({
  dayOfWeek,
  isSelected = false,
}: {
  dayOfWeek: InjectionDayOfWeekStats
  isSelected?: boolean
}) {
  const { width: termWidth } = useTerminalDimensions()
  const maxCount = Math.max(...dayOfWeek.days.map((d) => d.count), 1)
  // Responsive bar width: account for border, padding, day name (4), count digits (~4)
  const barMaxWidth = Math.max(10, Math.min(40, termWidth - 15))

  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: isSelected ? theme.accent : theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        marginTop: 1,
      }}
    >
      <box style={{ flexDirection: 'row' }}>
        {isSelected && <text fg={theme.accent}>▶ </text>}
        <text fg={theme.accent}>
          <strong>INJECTIONS BY DAY</strong>
        </text>
      </box>
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
function Section({
  title,
  color,
  children,
  isSelected = false,
}: {
  title: string
  color: string
  children: React.ReactNode
  isSelected?: boolean
}) {
  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: isSelected ? theme.accent : theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        marginBottom: 1,
      }}
    >
      <box style={{ flexDirection: 'row' }}>
        {isSelected && <text fg={theme.accent}>▶ </text>}
        <text fg={color}>
          <strong>{title}</strong>
        </text>
      </box>
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
