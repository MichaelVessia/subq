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

// SQLite stores dates as TEXT (ISO8601), so we need to parse them
const DateFromString = Schema.transform(Schema.String, Schema.DateFromSelf, {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
})

// Weight stats row schema
const WeightStatsRow = Schema.Struct({
  min_weight: Schema.NullOr(Schema.Number),
  max_weight: Schema.NullOr(Schema.Number),
  avg_weight: Schema.NullOr(Schema.Number),
  entry_count: Schema.Number,
})
const decodeWeightStatsRow = Schema.decodeUnknown(WeightStatsRow)

// Weight trend row schema
const WeightTrendRow = Schema.Struct({
  datetime: DateFromString,
  weight: Schema.Number,
})
const decodeWeightTrendRow = Schema.decodeUnknown(WeightTrendRow)

// Injection site count row schema
const InjectionSiteRow = Schema.Struct({
  injection_site: Schema.NullOr(Schema.String),
  count: Schema.Number,
})
const decodeInjectionSiteRow = Schema.decodeUnknown(InjectionSiteRow)

// Dosage history row schema
const DosageHistoryRow = Schema.Struct({
  datetime: DateFromString,
  drug: Schema.String,
  dosage: Schema.String,
})
const decodeDosageHistoryRow = Schema.decodeUnknown(DosageHistoryRow)

// Injection frequency row schema
const InjectionFrequencyRow = Schema.Struct({
  total_injections: Schema.Number,
  avg_days_between: Schema.NullOr(Schema.Number),
  most_frequent_dow: Schema.NullOr(Schema.Number),
  weeks_in_period: Schema.NullOr(Schema.Number),
})
const decodeInjectionFrequencyRow = Schema.decodeUnknown(InjectionFrequencyRow)

// Drug count row schema
const DrugCountRow = Schema.Struct({
  drug: Schema.String,
  count: Schema.Number,
})
const decodeDrugCountRow = Schema.decodeUnknown(DrugCountRow)

// Day of week count row schema
const DayOfWeekCountRow = Schema.Struct({
  day_of_week: Schema.Number,
  count: Schema.Number,
})
const decodeDayOfWeekCountRow = Schema.decodeUnknown(DayOfWeekCountRow)

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

    return {
      getWeightStats: (params, userId) =>
        Effect.gen(function* () {
          const startDateStr = params.startDate?.toISOString()
          const endDateStr = params.endDate?.toISOString()

          // Get summary stats
          const summaryRows = yield* sql`
            SELECT
              MIN(weight) as min_weight,
              MAX(weight) as max_weight,
              AVG(weight) as avg_weight,
              COUNT(*) as entry_count
            FROM weight_logs
            WHERE user_id = ${userId}
            ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
            ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
          `
          if (summaryRows.length === 0) return null

          const decoded = yield* decodeWeightStatsRow(summaryRows[0])
          if (!decoded.min_weight || !decoded.max_weight || !decoded.avg_weight) {
            return null
          }

          // Get all points for linear regression rate calculation
          const pointRows = yield* sql`
            SELECT datetime, weight
            FROM weight_logs
            WHERE user_id = ${userId}
            ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
            ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
            ORDER BY datetime ASC
          `

          const points: { date: Date; weight: number }[] = []
          for (const row of pointRows) {
            const point = yield* decodeWeightTrendRow(row)
            points.push({ date: point.datetime, weight: point.weight })
          }

          // Use linear regression for rate of change (same as trend line)
          const rateOfChangeNum = computeRateOfChange(points)

          return new WeightStats({
            minWeight: Weight.make(decoded.min_weight),
            maxWeight: Weight.make(decoded.max_weight),
            avgWeight: Weight.make(decoded.avg_weight),
            rateOfChange: WeightRateOfChange.make(rateOfChangeNum),
            entryCount: Count.make(decoded.entry_count),
          })
        }).pipe(Effect.orDie),

      getWeightTrend: (params, userId) =>
        Effect.gen(function* () {
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

          return new WeightTrendStats({ points, trendLine })
        }).pipe(Effect.orDie),

      getInjectionSiteStats: (params, userId) =>
        Effect.gen(function* () {
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
          return new InjectionSiteStats({ sites, totalInjections: Count.make(total) })
        }).pipe(Effect.orDie),

      getDosageHistory: (params, userId) =>
        Effect.gen(function* () {
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
            const dosageValueNum = match ? Number.parseFloat(match[1]!) : 0
            points.push(
              new DosageHistoryPoint({
                date: decoded.datetime,
                drug: DrugName.make(decoded.drug),
                dosage: Dosage.make(decoded.dosage),
                dosageValue: DosageValue.make(dosageValueNum),
              }),
            )
          }
          return new DosageHistoryStats({ points })
        }).pipe(Effect.orDie),

      getInjectionFrequency: (params, userId) =>
        Effect.gen(function* () {
          const startDateStr = params.startDate?.toISOString()
          const endDateStr = params.endDate?.toISOString()
          // SQLite: strftime('%w', date) returns day of week (0=Sunday, 6=Saturday)
          // julianday() for date arithmetic
          const rows = yield* sql`
            WITH injection_data AS (
              SELECT 
                datetime,
                LAG(datetime) OVER (ORDER BY datetime) as prev_datetime,
                CAST(strftime('%w', datetime) AS INTEGER) as day_of_week
              FROM injection_logs
              WHERE user_id = ${userId}
              ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
              ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
            ),
            day_counts AS (
              SELECT day_of_week, COUNT(*) as cnt
              FROM injection_data
              GROUP BY day_of_week
              ORDER BY cnt DESC
              LIMIT 1
            )
            SELECT
              (SELECT COUNT(*) FROM injection_data) as total_injections,
              (SELECT AVG(julianday(datetime) - julianday(prev_datetime))
               FROM injection_data WHERE prev_datetime IS NOT NULL) as avg_days_between,
              (SELECT day_of_week FROM day_counts) as most_frequent_dow,
              (SELECT (julianday(MAX(datetime)) - julianday(MIN(datetime))) / 7.0
               FROM injection_data) as weeks_in_period
          `
          if (rows.length === 0) return null

          const decoded = yield* decodeInjectionFrequencyRow(rows[0])
          const totalInjectionsNum = decoded.total_injections
          if (totalInjectionsNum === 0) return null

          const weeks = decoded.weeks_in_period ?? 1
          const injectionsPerWeekNum = weeks > 0 ? totalInjectionsNum / weeks : totalInjectionsNum

          return new InjectionFrequencyStats({
            totalInjections: Count.make(totalInjectionsNum),
            avgDaysBetween: DaysBetween.make(decoded.avg_days_between ?? 0),
            mostFrequentDayOfWeek:
              decoded.most_frequent_dow !== null ? DayOfWeek.make(decoded.most_frequent_dow) : null,
            injectionsPerWeek: InjectionsPerWeek.make(injectionsPerWeekNum),
          })
        }).pipe(Effect.orDie),

      getDrugBreakdown: (params, userId) =>
        Effect.gen(function* () {
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
          return new DrugBreakdownStats({ drugs, totalInjections: Count.make(total) })
        }).pipe(Effect.orDie),

      getInjectionByDayOfWeek: (params, userId) =>
        Effect.gen(function* () {
          const startDateStr = params.startDate?.toISOString()
          const endDateStr = params.endDate?.toISOString()
          // SQLite: strftime('%w', date) returns day of week (0=Sunday, 6=Saturday)
          const rows = yield* sql`
            SELECT 
              CAST(strftime('%w', datetime) AS INTEGER) as day_of_week,
              COUNT(*) as count
            FROM injection_logs
            WHERE user_id = ${userId}
            ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
            ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
            GROUP BY strftime('%w', datetime)
            ORDER BY day_of_week
          `
          const days: DayOfWeekCount[] = []
          let total = 0
          for (const row of rows) {
            const decoded = yield* decodeDayOfWeekCountRow(row)
            const countNum = decoded.count
            days.push(
              new DayOfWeekCount({
                dayOfWeek: DayOfWeek.make(decoded.day_of_week),
                count: Count.make(countNum),
              }),
            )
            total += countNum
          }
          return new InjectionDayOfWeekStats({ days, totalInjections: Count.make(total) })
        }).pipe(Effect.orDie),
    }
  }),
)
