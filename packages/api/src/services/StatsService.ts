import { SqlClient } from '@effect/sql'
import {
  DashboardStats,
  type DashboardStatsParams,
  DayOfWeekCount,
  DosageHistoryPoint,
  DosageHistoryStats,
  DrugBreakdownStats,
  DrugCount,
  InjectionDayOfWeekStats,
  InjectionFrequencyStats,
  InjectionSiteCount,
  InjectionSiteStats,
  type StatsParams,
  WeightStats,
  WeightTrendPoint,
  WeightTrendStats,
} from '@scale/shared'
import { Effect, Layer, Schema } from 'effect'

// ============================================
// Raw SQL Result Schema
// ============================================

const StatsRow = Schema.Struct({
  start_weight: Schema.NullOr(Schema.NumberFromString),
  end_weight: Schema.NullOr(Schema.NumberFromString),
  start_date: Schema.NullOr(Schema.DateFromSelf),
  end_date: Schema.NullOr(Schema.DateFromSelf),
  data_point_count: Schema.NumberFromString,
})

const decodeRow = Schema.decodeUnknown(StatsRow)

// Weight stats row schema
const WeightStatsRow = Schema.Struct({
  min_weight: Schema.NullOr(Schema.NumberFromString),
  max_weight: Schema.NullOr(Schema.NumberFromString),
  avg_weight: Schema.NullOr(Schema.NumberFromString),
  start_weight: Schema.NullOr(Schema.NumberFromString),
  end_weight: Schema.NullOr(Schema.NumberFromString),
  days_span: Schema.NullOr(Schema.NumberFromString),
  entry_count: Schema.NumberFromString,
})
const decodeWeightStatsRow = Schema.decodeUnknown(WeightStatsRow)

// Weight trend row schema
const WeightTrendRow = Schema.Struct({
  datetime: Schema.DateFromSelf,
  weight: Schema.NumberFromString,
})
const decodeWeightTrendRow = Schema.decodeUnknown(WeightTrendRow)

// Injection site count row schema
const InjectionSiteRow = Schema.Struct({
  injection_site: Schema.NullOr(Schema.String),
  count: Schema.NumberFromString,
})
const decodeInjectionSiteRow = Schema.decodeUnknown(InjectionSiteRow)

// Dosage history row schema
const DosageHistoryRow = Schema.Struct({
  datetime: Schema.DateFromSelf,
  dosage: Schema.String,
})
const decodeDosageHistoryRow = Schema.decodeUnknown(DosageHistoryRow)

// Injection frequency row schema
const InjectionFrequencyRow = Schema.Struct({
  total_injections: Schema.NumberFromString,
  avg_days_between: Schema.NullOr(Schema.NumberFromString),
  most_frequent_dow: Schema.NullOr(Schema.NumberFromString),
  weeks_in_period: Schema.NullOr(Schema.NumberFromString),
})
const decodeInjectionFrequencyRow = Schema.decodeUnknown(InjectionFrequencyRow)

// Drug count row schema
const DrugCountRow = Schema.Struct({
  drug: Schema.String,
  count: Schema.NumberFromString,
})
const decodeDrugCountRow = Schema.decodeUnknown(DrugCountRow)

// Day of week count row schema
const DayOfWeekCountRow = Schema.Struct({
  day_of_week: Schema.NumberFromString,
  count: Schema.NumberFromString,
})
const decodeDayOfWeekCountRow = Schema.decodeUnknown(DayOfWeekCountRow)

// ============================================
// Stats Service Definition
// ============================================

export class StatsService extends Effect.Tag('StatsService')<
  StatsService,
  {
    readonly getDashboardStats: (params: DashboardStatsParams, userId: string) => Effect.Effect<DashboardStats | null>
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
      getDashboardStats: (params, userId) =>
        Effect.gen(function* () {
          // Single query to get first/last weights and count within date range
          // This is more efficient than fetching all data to the client
          const rows = yield* sql`
            WITH filtered AS (
              SELECT datetime, weight
              FROM weight_logs
              WHERE user_id = ${userId}
              ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
              ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
              ORDER BY datetime
            ),
            stats AS (
              SELECT
                (SELECT weight FROM filtered ORDER BY datetime ASC LIMIT 1) as start_weight,
                (SELECT weight FROM filtered ORDER BY datetime DESC LIMIT 1) as end_weight,
                (SELECT datetime FROM filtered ORDER BY datetime ASC LIMIT 1) as start_date,
                (SELECT datetime FROM filtered ORDER BY datetime DESC LIMIT 1) as end_date,
                COUNT(*)::text as data_point_count
              FROM filtered
            )
            SELECT * FROM stats
          `

          if (rows.length === 0) return null

          const decoded = yield* decodeRow(rows[0])

          // Need at least 2 data points for meaningful stats
          const count = Number(decoded.data_point_count)
          if (count < 2 || !decoded.start_weight || !decoded.end_weight || !decoded.start_date || !decoded.end_date) {
            return null
          }

          const startWeight = decoded.start_weight
          const endWeight = decoded.end_weight
          const totalChange = endWeight - startWeight
          const percentChange = (totalChange / startWeight) * 100

          // Calculate weekly average
          const daysDiff = (decoded.end_date.getTime() - decoded.start_date.getTime()) / (1000 * 60 * 60 * 24)
          const weeks = daysDiff / 7
          const weeklyAvg = weeks > 0 ? totalChange / weeks : 0

          return new DashboardStats({
            startWeight,
            endWeight,
            totalChange,
            percentChange,
            weeklyAvg,
            dataPointCount: count,
            periodStart: decoded.start_date,
            periodEnd: decoded.end_date,
          })
        }).pipe(Effect.orDie),

      getWeightStats: (params, userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            WITH filtered AS (
              SELECT datetime, weight
              FROM weight_logs
              WHERE user_id = ${userId}
              ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
              ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
              ORDER BY datetime
            )
            SELECT
              MIN(weight)::text as min_weight,
              MAX(weight)::text as max_weight,
              AVG(weight)::text as avg_weight,
              (SELECT weight FROM filtered ORDER BY datetime ASC LIMIT 1)::text as start_weight,
              (SELECT weight FROM filtered ORDER BY datetime DESC LIMIT 1)::text as end_weight,
              (EXTRACT(EPOCH FROM (MAX(datetime) - MIN(datetime))) / 86400)::text as days_span,
              COUNT(*)::text as entry_count
            FROM filtered
          `
          if (rows.length === 0) return null

          const decoded = yield* decodeWeightStatsRow(rows[0])
          if (!decoded.min_weight || !decoded.max_weight || !decoded.avg_weight) {
            return null
          }

          // Calculate rate of change (lbs per week)
          const daysSpan = decoded.days_span ?? 0
          const weeks = daysSpan / 7
          const weightChange = (decoded.end_weight ?? 0) - (decoded.start_weight ?? 0)
          const rateOfChange = weeks > 0 ? weightChange / weeks : 0

          return new WeightStats({
            minWeight: decoded.min_weight,
            maxWeight: decoded.max_weight,
            avgWeight: decoded.avg_weight,
            rateOfChange,
            entryCount: Number(decoded.entry_count),
          })
        }).pipe(Effect.orDie),

      getWeightTrend: (params, userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT datetime, weight::text
            FROM weight_logs
            WHERE user_id = ${userId}
            ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
            ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
            ORDER BY datetime ASC
          `
          const points: WeightTrendPoint[] = []
          for (const row of rows) {
            const decoded = yield* decodeWeightTrendRow(row)
            points.push(new WeightTrendPoint({ date: decoded.datetime, weight: decoded.weight }))
          }
          return new WeightTrendStats({ points })
        }).pipe(Effect.orDie),

      getInjectionSiteStats: (params, userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT 
              COALESCE(injection_site, 'Unknown') as injection_site,
              COUNT(*)::text as count
            FROM injection_logs
            WHERE user_id = ${userId}
            ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
            ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
            GROUP BY injection_site
            ORDER BY count DESC
          `
          const sites: InjectionSiteCount[] = []
          let total = 0
          for (const row of rows) {
            const decoded = yield* decodeInjectionSiteRow(row)
            const count = Number(decoded.count)
            sites.push(new InjectionSiteCount({ site: decoded.injection_site ?? 'Unknown', count }))
            total += count
          }
          return new InjectionSiteStats({ sites, totalInjections: total })
        }).pipe(Effect.orDie),

      getDosageHistory: (params, userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT datetime, dosage
            FROM injection_logs
            WHERE user_id = ${userId}
            ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
            ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
            ORDER BY datetime ASC
          `
          const points: DosageHistoryPoint[] = []
          for (const row of rows) {
            const decoded = yield* decodeDosageHistoryRow(row)
            // Extract numeric value from dosage string (e.g., "5mg" -> 5)
            const match = decoded.dosage.match(/(\d+(?:\.\d+)?)/)
            const dosageValue = match ? Number.parseFloat(match[1]!) : 0
            points.push(
              new DosageHistoryPoint({
                date: decoded.datetime,
                dosage: decoded.dosage,
                dosageValue,
              }),
            )
          }
          return new DosageHistoryStats({ points })
        }).pipe(Effect.orDie),

      getInjectionFrequency: (params, userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            WITH injection_data AS (
              SELECT 
                datetime,
                LAG(datetime) OVER (ORDER BY datetime) as prev_datetime,
                EXTRACT(DOW FROM datetime)::int as day_of_week
              FROM injection_logs
              WHERE user_id = ${userId}
              ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
              ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
            ),
            day_counts AS (
              SELECT day_of_week, COUNT(*) as cnt
              FROM injection_data
              GROUP BY day_of_week
              ORDER BY cnt DESC
              LIMIT 1
            )
            SELECT
              (SELECT COUNT(*) FROM injection_data)::text as total_injections,
              (SELECT AVG(EXTRACT(EPOCH FROM (datetime - prev_datetime)) / 86400) 
               FROM injection_data WHERE prev_datetime IS NOT NULL)::text as avg_days_between,
              (SELECT day_of_week FROM day_counts)::text as most_frequent_dow,
              (SELECT EXTRACT(EPOCH FROM (MAX(datetime) - MIN(datetime))) / (7 * 86400)
               FROM injection_data)::text as weeks_in_period
          `
          if (rows.length === 0) return null

          const decoded = yield* decodeInjectionFrequencyRow(rows[0])
          const totalInjections = Number(decoded.total_injections)
          if (totalInjections === 0) return null

          const weeks = decoded.weeks_in_period ?? 1
          const injectionsPerWeek = weeks > 0 ? totalInjections / weeks : totalInjections

          return new InjectionFrequencyStats({
            totalInjections,
            avgDaysBetween: decoded.avg_days_between ?? 0,
            mostFrequentDayOfWeek: decoded.most_frequent_dow,
            injectionsPerWeek,
          })
        }).pipe(Effect.orDie),

      getDrugBreakdown: (params, userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT drug, COUNT(*)::text as count
            FROM injection_logs
            WHERE user_id = ${userId}
            ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
            ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
            GROUP BY drug
            ORDER BY count DESC
          `
          const drugs: DrugCount[] = []
          let total = 0
          for (const row of rows) {
            const decoded = yield* decodeDrugCountRow(row)
            const count = Number(decoded.count)
            drugs.push(new DrugCount({ drug: decoded.drug, count }))
            total += count
          }
          return new DrugBreakdownStats({ drugs, totalInjections: total })
        }).pipe(Effect.orDie),

      getInjectionByDayOfWeek: (params, userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT 
              EXTRACT(DOW FROM datetime)::text as day_of_week,
              COUNT(*)::text as count
            FROM injection_logs
            WHERE user_id = ${userId}
            ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
            ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
            GROUP BY EXTRACT(DOW FROM datetime)
            ORDER BY day_of_week
          `
          const days: DayOfWeekCount[] = []
          let total = 0
          for (const row of rows) {
            const decoded = yield* decodeDayOfWeekCountRow(row)
            const count = Number(decoded.count)
            days.push(new DayOfWeekCount({ dayOfWeek: Number(decoded.day_of_week), count }))
            total += count
          }
          return new InjectionDayOfWeekStats({ days, totalInjections: total })
        }).pipe(Effect.orDie),
    }
  }),
)
