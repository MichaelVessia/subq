import { SqlClient } from '@effect/sql'
import {
  Count,
  DayOfWeek,
  DayOfWeekCount,
  DaysBetween,
  Dosage,
  DosageHistoryPoint,
  DosageHistoryStats,
  DosageValue,
  DrugBreakdownStats,
  DrugCount,
  DrugName,
  InjectionDayOfWeekStats,
  InjectionFrequencyStats,
  InjectionSiteCount,
  InjectionSiteStats,
  InjectionsPerWeek,
  InjectionSite,
  type StatsParams,
  TrendLine,
  Weight,
  WeightRateOfChange,
  WeightStats,
  WeightTrendPoint,
  WeightTrendStats,
} from '@subq/shared'
import { Effect, Layer, Schema } from 'effect'

// ============================================
// Raw SQL Result Schema
// ============================================

// Weight stats row schema (combined query with points as JSON)
const WeightStatsRow = Schema.Struct({
  min_weight: Schema.NullOr(Schema.Number),
  max_weight: Schema.NullOr(Schema.Number),
  avg_weight: Schema.NullOr(Schema.Number),
  entry_count: Schema.Number,
  points_json: Schema.String,
})
const decodeWeightStatsRow = Schema.decodeUnknown(WeightStatsRow)

// Schema for parsing points from JSON string
const WeightPointJson = Schema.Struct({
  datetime: Schema.String,
  weight: Schema.Number,
})
const decodeWeightPointsJson = Schema.decodeUnknown(Schema.parseJson(Schema.Array(WeightPointJson)))

// Weight trend row schema - Schema.Date decodes ISO8601 string to Date
const WeightTrendRow = Schema.Struct({
  datetime: Schema.Date,
  weight: Schema.Number,
})
const decodeWeightTrendRow = Schema.decodeUnknown(WeightTrendRow)

// Injection site count row schema
const InjectionSiteRow = Schema.Struct({
  injection_site: Schema.NullOr(Schema.String),
  count: Schema.Number,
})
const decodeInjectionSiteRow = Schema.decodeUnknown(InjectionSiteRow)

// Dosage history row schema - Schema.Date decodes ISO8601 string to Date
const DosageHistoryRow = Schema.Struct({
  datetime: Schema.Date,
  drug: Schema.String,
  dosage: Schema.String,
})
const decodeDosageHistoryRow = Schema.decodeUnknown(DosageHistoryRow)

// Drug count row schema
const DrugCountRow = Schema.Struct({
  drug: Schema.String,
  count: Schema.Number,
})
const decodeDrugCountRow = Schema.decodeUnknown(DrugCountRow)

// Datetime-only row schema (for timezone-aware day of week calculation)
const DatetimeRow = Schema.Struct({
  datetime: Schema.String,
})
const decodeDatetimeRow = Schema.decodeUnknown(DatetimeRow)

// ============================================
// Linear Regression Helpers
// ============================================

interface LinearRegressionResult {
  slope: number // lbs per millisecond
  intercept: number
}

/**
 * Computes linear regression coefficients from data points.
 * Returns null if fewer than 2 points or all points at same time.
 */
function computeLinearRegression(points: { date: Date; weight: number }[]): LinearRegressionResult | null {
  if (points.length < 2) return null

  const n = points.length
  // Use timestamps as x values (milliseconds since epoch)
  const sumX = points.reduce((acc, p) => acc + p.date.getTime(), 0)
  const sumY = points.reduce((acc, p) => acc + p.weight, 0)
  const sumXY = points.reduce((acc, p) => acc + p.date.getTime() * p.weight, 0)
  const sumX2 = points.reduce((acc, p) => acc + p.date.getTime() * p.date.getTime(), 0)

  const denominator = n * sumX2 - sumX * sumX
  // Avoid division by zero (all points at same time)
  if (denominator === 0) return null

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  return { slope, intercept }
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

// ============================================
// Timezone Helpers
// ============================================

/**
 * Gets the day of week (0=Sunday, 6=Saturday) for a date in a specific timezone.
 * Uses Intl.DateTimeFormat for IANA timezone support.
 */
function getDayOfWeekInTimezone(date: Date, timezone: string): number {
  // Create a formatter that outputs the weekday as a number in the target timezone
  // We use 'short' weekday and map it, or use formatToParts
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  })
  const weekdayStr = formatter.format(date)
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return dayMap[weekdayStr] ?? 0
}

/**
 * Computes rate of change in lbs per week using linear regression.
 * Returns 0 if fewer than 2 points.
 */
function computeRateOfChange(points: { date: Date; weight: number }[]): number {
  const regression = computeLinearRegression(points)
  if (!regression) return 0
  return regression.slope * MS_PER_WEEK
}

/**
 * Computes a linear regression trend line from weight data points.
 * Returns null if fewer than 2 points.
 */
function computeTrendLine(points: WeightTrendPoint[]): TrendLine | null {
  const regression = computeLinearRegression(points)
  if (!regression || points.length < 2) return null

  const { slope, intercept } = regression

  // Calculate start and end points for the trend line
  const startDate = points[0]!.date
  const endDate = points[points.length - 1]!.date
  const startWeight = slope * startDate.getTime() + intercept
  const endWeight = slope * endDate.getTime() + intercept

  return new TrendLine({
    slope,
    intercept,
    startDate,
    startWeight: Weight.make(startWeight),
    endDate,
    endWeight: Weight.make(endWeight),
  })
}

// ============================================
// Stats Service Definition
// ============================================

export class StatsService extends Effect.Tag('StatsService')<
  StatsService,
  {
    readonly getWeightStats: (params: StatsParams, userId: string) => Effect.Effect<WeightStats | null>
    readonly getWeightTrend: (params: StatsParams, userId: string) => Effect.Effect<WeightTrendStats>
    readonly getInjectionSiteStats: (params: StatsParams, userId: string) => Effect.Effect<InjectionSiteStats>
    readonly getDosageHistory: (params: StatsParams, userId: string) => Effect.Effect<DosageHistoryStats>
    readonly getInjectionFrequency: (
      params: StatsParams,
      userId: string,
    ) => Effect.Effect<InjectionFrequencyStats | null>
    readonly getDrugBreakdown: (params: StatsParams, userId: string) => Effect.Effect<DrugBreakdownStats>
    readonly getInjectionByDayOfWeek: (params: StatsParams, userId: string) => Effect.Effect<InjectionDayOfWeekStats>
  }
>() {}

// ============================================
// Stats Service Implementation
// ============================================

export const StatsServiceLive = Layer.effect(
  StatsService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const getWeightStats = (params: StatsParams, userId: string) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const startDateStr = params.startDate?.toISOString()
        const endDateStr = params.endDate?.toISOString()

        // Combined query: get summary stats and all points in a single D1 roundtrip
        const rows = yield* sql`
          SELECT
            MIN(weight) as min_weight,
            MAX(weight) as max_weight,
            AVG(weight) as avg_weight,
            COUNT(*) as entry_count,
            (
              SELECT json_group_array(json_object('datetime', datetime, 'weight', weight))
              FROM (
                SELECT datetime, weight
                FROM weight_logs
                WHERE user_id = ${userId}
                ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
                ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
                ORDER BY datetime ASC
              )
            ) as points_json
          FROM weight_logs
          WHERE user_id = ${userId}
          ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
        `
        if (rows.length === 0) return null

        const decoded = yield* decodeWeightStatsRow(rows[0])
        if (!decoded.min_weight || !decoded.max_weight || !decoded.avg_weight) {
          return null
        }

        // Parse points from JSON
        const pointsRaw = yield* decodeWeightPointsJson(decoded.points_json)
        const points: { date: Date; weight: number }[] = pointsRaw.map((p) => ({
          date: new Date(p.datetime),
          weight: p.weight,
        }))

        // Use linear regression for rate of change (same as trend line)
        const rateOfChangeNum = computeRateOfChange(points)
        yield* Effect.annotateCurrentSpan('entryCount', decoded.entry_count)

        return new WeightStats({
          minWeight: Weight.make(decoded.min_weight),
          maxWeight: Weight.make(decoded.max_weight),
          avgWeight: Weight.make(decoded.avg_weight),
          rateOfChange: WeightRateOfChange.make(rateOfChangeNum),
          entryCount: Count.make(decoded.entry_count),
        })
      }).pipe(Effect.withSpan('StatsService.getWeightStats'), Effect.orDie)

    const getWeightTrend = (params: StatsParams, userId: string) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const startDateStr = params.startDate?.toISOString()
        const endDateStr = params.endDate?.toISOString()
        const rows = yield* sql`
          SELECT datetime, weight
          FROM weight_logs
          WHERE user_id = ${userId}
          ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
          ORDER BY datetime ASC
        `
        const points: WeightTrendPoint[] = []
        for (const row of rows) {
          const decoded = yield* decodeWeightTrendRow(row)
          points.push(new WeightTrendPoint({ date: decoded.datetime, weight: Weight.make(decoded.weight) }))
        }

        // Calculate linear regression trend line
        const trendLine = computeTrendLine(points)
        yield* Effect.annotateCurrentSpan('pointCount', points.length)

        return new WeightTrendStats({ points, trendLine })
      }).pipe(Effect.withSpan('StatsService.getWeightTrend'), Effect.orDie)

    const getInjectionSiteStats = (params: StatsParams, userId: string) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const startDateStr = params.startDate?.toISOString()
        const endDateStr = params.endDate?.toISOString()
        const rows = yield* sql`
          SELECT
            COALESCE(injection_site, 'Unknown') as injection_site,
            COUNT(*) as count
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
          GROUP BY injection_site
          ORDER BY count DESC
        `
        const sites: InjectionSiteCount[] = []
        let total = 0
        for (const row of rows) {
          const decoded = yield* decodeInjectionSiteRow(row)
          const countNum = decoded.count
          sites.push(
            new InjectionSiteCount({
              site: InjectionSite.make(decoded.injection_site ?? 'Unknown'),
              count: Count.make(countNum),
            }),
          )
          total += countNum
        }
        yield* Effect.annotateCurrentSpan('totalInjections', total)
        return new InjectionSiteStats({ sites, totalInjections: Count.make(total) })
      }).pipe(Effect.withSpan('StatsService.getInjectionSiteStats'), Effect.orDie)

    const getDosageHistory = (params: StatsParams, userId: string) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const startDateStr = params.startDate?.toISOString()
        const endDateStr = params.endDate?.toISOString()
        const rows = yield* sql`
          SELECT datetime, drug, dosage
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
          ORDER BY datetime ASC
        `
        const points: DosageHistoryPoint[] = []
        for (const row of rows) {
          const decoded = yield* decodeDosageHistoryRow(row)
          // Extract numeric value from dosage string (e.g., "5mg" -> 5)
          const match = decoded.dosage.match(/(\d+(?:\.\d+)?)/)
          const captured = match?.[1]
          const dosageValueNum = captured !== undefined ? Number.parseFloat(captured) : 0
          points.push(
            new DosageHistoryPoint({
              date: decoded.datetime,
              drug: DrugName.make(decoded.drug),
              dosage: Dosage.make(decoded.dosage),
              dosageValue: DosageValue.make(dosageValueNum),
            }),
          )
        }
        yield* Effect.annotateCurrentSpan('pointCount', points.length)
        return new DosageHistoryStats({ points })
      }).pipe(Effect.withSpan('StatsService.getDosageHistory'), Effect.orDie)

    const getInjectionFrequency = (params: StatsParams, userId: string) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const startDateStr = params.startDate?.toISOString()
        const endDateStr = params.endDate?.toISOString()
        const timezone = params.timezone ?? 'UTC'

        // Fetch datetimes for timezone-aware day-of-week calculation
        // and let SQLite handle the date arithmetic (avg days between, weeks in period)
        const rows = yield* sql`
          WITH injection_data AS (
            SELECT
              datetime,
              LAG(datetime) OVER (ORDER BY datetime) as prev_datetime
            FROM injection_logs
            WHERE user_id = ${userId}
            ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
            ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
          )
          SELECT
            (SELECT COUNT(*) FROM injection_data) as total_injections,
            (SELECT AVG(julianday(datetime) - julianday(prev_datetime))
             FROM injection_data WHERE prev_datetime IS NOT NULL) as avg_days_between,
            (SELECT (julianday(MAX(datetime)) - julianday(MIN(datetime))) / 7.0
             FROM injection_data) as weeks_in_period
        `
        if (rows.length === 0) return null

        // Parse the frequency stats (without day of week - we'll calculate that separately)
        const FrequencyRow = Schema.Struct({
          total_injections: Schema.Number,
          avg_days_between: Schema.NullOr(Schema.Number),
          weeks_in_period: Schema.NullOr(Schema.Number),
        })
        const decoded = yield* Schema.decodeUnknown(FrequencyRow)(rows[0])
        const totalInjectionsNum = decoded.total_injections
        if (totalInjectionsNum === 0) return null

        // Now fetch all datetimes for timezone-aware day-of-week calculation
        const datetimeRows = yield* sql`
          SELECT datetime
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
        `

        // Count by day of week in user's timezone
        const dayCounts = new Map<number, number>()
        for (const row of datetimeRows) {
          const dtDecoded = yield* decodeDatetimeRow(row)
          const date = new Date(dtDecoded.datetime)
          const dayOfWeek = getDayOfWeekInTimezone(date, timezone)
          dayCounts.set(dayOfWeek, (dayCounts.get(dayOfWeek) ?? 0) + 1)
        }

        // Find most frequent day of week
        let mostFrequentDow: number | null = null
        let maxCount = 0
        for (const [dow, count] of dayCounts.entries()) {
          if (count > maxCount) {
            maxCount = count
            mostFrequentDow = dow
          }
        }

        const weeks = decoded.weeks_in_period ?? 1
        const injectionsPerWeekNum = weeks > 0 ? totalInjectionsNum / weeks : totalInjectionsNum
        yield* Effect.annotateCurrentSpan('totalInjections', totalInjectionsNum)
        yield* Effect.annotateCurrentSpan('timezone', timezone)

        return new InjectionFrequencyStats({
          totalInjections: Count.make(totalInjectionsNum),
          avgDaysBetween: DaysBetween.make(decoded.avg_days_between ?? 0),
          mostFrequentDayOfWeek: mostFrequentDow !== null ? DayOfWeek.make(mostFrequentDow) : null,
          injectionsPerWeek: InjectionsPerWeek.make(injectionsPerWeekNum),
        })
      }).pipe(Effect.withSpan('StatsService.getInjectionFrequency'), Effect.orDie)

    const getDrugBreakdown = (params: StatsParams, userId: string) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const startDateStr = params.startDate?.toISOString()
        const endDateStr = params.endDate?.toISOString()
        const rows = yield* sql`
          SELECT drug, COUNT(*) as count
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
          GROUP BY drug
          ORDER BY count DESC
        `
        const drugs: DrugCount[] = []
        let total = 0
        for (const row of rows) {
          const decoded = yield* decodeDrugCountRow(row)
          const countNum = decoded.count
          drugs.push(new DrugCount({ drug: DrugName.make(decoded.drug), count: Count.make(countNum) }))
          total += countNum
        }
        yield* Effect.annotateCurrentSpan('totalInjections', total)
        return new DrugBreakdownStats({ drugs, totalInjections: Count.make(total) })
      }).pipe(Effect.withSpan('StatsService.getDrugBreakdown'), Effect.orDie)

    const getInjectionByDayOfWeek = (params: StatsParams, userId: string) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const startDateStr = params.startDate?.toISOString()
        const endDateStr = params.endDate?.toISOString()
        const timezone = params.timezone ?? 'UTC'

        // Fetch raw datetimes and calculate day of week in user's timezone
        // SQLite's strftime uses UTC, so we need to do this in JS
        const rows = yield* sql`
          SELECT datetime
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
        `

        // Count by day of week in user's timezone
        const dayCounts = new Map<number, number>()
        let total = 0
        for (const row of rows) {
          const decoded = yield* decodeDatetimeRow(row)
          const date = new Date(decoded.datetime)
          const dayOfWeek = getDayOfWeekInTimezone(date, timezone)
          dayCounts.set(dayOfWeek, (dayCounts.get(dayOfWeek) ?? 0) + 1)
          total += 1
        }

        // Convert to sorted array of DayOfWeekCount
        const days: DayOfWeekCount[] = []
        for (const [dayOfWeek, count] of dayCounts.entries()) {
          days.push(
            new DayOfWeekCount({
              dayOfWeek: DayOfWeek.make(dayOfWeek),
              count: Count.make(count),
            }),
          )
        }
        days.sort((a, b) => a.dayOfWeek - b.dayOfWeek)

        yield* Effect.annotateCurrentSpan('totalInjections', total)
        yield* Effect.annotateCurrentSpan('timezone', timezone)
        return new InjectionDayOfWeekStats({ days, totalInjections: Count.make(total) })
      }).pipe(Effect.withSpan('StatsService.getInjectionByDayOfWeek'), Effect.orDie)

    return {
      getWeightStats,
      getWeightTrend,
      getInjectionSiteStats,
      getDosageHistory,
      getInjectionFrequency,
      getDrugBreakdown,
      getInjectionByDayOfWeek,
    }
  }),
)
