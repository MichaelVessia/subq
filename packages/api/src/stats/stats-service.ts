import { SqlClient } from 'effect/unstable/sql'
import {
  buildInjectionDayOfWeekStats,
  buildObservedInjectionFrequency,
  calculateWeightTrajectory,
  Count,
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
  InjectionSite,
  type StatsParams,
  TrendLine,
  Weight,
  WeightRateOfChange,
  WeightStats,
  WeightTrendPoint,
  WeightTrendStats,
} from '@subq/shared'
import { Context, Effect, Layer, Schema } from 'effect'

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
const decodeWeightStatsRow = Schema.decodeUnknownEffect(WeightStatsRow)

// Schema for parsing points from JSON
const WeightPointJson = Schema.Struct({
  datetime: Schema.String,
  weight: Schema.Number,
})
const decodeWeightPointsJson = Schema.decodeUnknownEffect(Schema.Array(WeightPointJson))

// Weight trend row schema - decode ISO8601 string to Date
const WeightTrendRow = Schema.Struct({
  datetime: Schema.DateFromString,
  weight: Schema.Number,
})
const decodeWeightTrendRow = Schema.decodeUnknownEffect(WeightTrendRow)

// Injection site count row schema
const InjectionSiteRow = Schema.Struct({
  injection_site: Schema.NullOr(Schema.String),
  count: Schema.Number,
})
const decodeInjectionSiteRow = Schema.decodeUnknownEffect(InjectionSiteRow)

// Dosage history row schema - decode ISO8601 string to Date
const DosageHistoryRow = Schema.Struct({
  datetime: Schema.DateFromString,
  drug: Schema.String,
  dosage: Schema.String,
})
const decodeDosageHistoryRow = Schema.decodeUnknownEffect(DosageHistoryRow)

// Drug count row schema
const DrugCountRow = Schema.Struct({
  drug: Schema.String,
  count: Schema.Number,
})
const decodeDrugCountRow = Schema.decodeUnknownEffect(DrugCountRow)

// Datetime-only row schema (for timezone-aware day of week calculation)
const DatetimeRow = Schema.Struct({
  datetime: Schema.DateFromString,
})
const decodeDatetimeRows = Schema.decodeUnknownEffect(Schema.Array(DatetimeRow))

// ============================================
// Stats Service Definition
// ============================================

export class StatsService extends Context.Service<
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
>()('StatsService') {}

// ============================================
// Stats Service Implementation
// ============================================

export const StatsServiceLive = Layer.effect(
  StatsService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const listInjectionDatetimes = (params: StatsParams, userId: string) =>
      Effect.gen(function* () {
        const startDateStr = params.startDate?.toISOString()
        const endDateStr = params.endDate?.toISOString()
        const rows = yield* sql`
          SELECT datetime
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
          ORDER BY datetime ASC
        `
        const decoded = yield* decodeDatetimeRows(rows)
        return decoded.map((row) => row.datetime)
      })

    const getWeightStats = (params: StatsParams, userId: string) =>
      Effect.fn('StatsService.getWeightStats')(function* () {
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
        const pointsRaw = yield* decodeWeightPointsJson(JSON.parse(decoded.points_json))
        const points: { date: Date; weight: number }[] = pointsRaw.map((p) => ({
          date: new Date(p.datetime),
          weight: p.weight,
        }))

        const trajectory = calculateWeightTrajectory(points)
        yield* Effect.annotateCurrentSpan('entryCount', decoded.entry_count)

        return new WeightStats({
          minWeight: Weight.make(decoded.min_weight),
          maxWeight: Weight.make(decoded.max_weight),
          avgWeight: Weight.make(decoded.avg_weight),
          rateOfChange: WeightRateOfChange.make(trajectory.rateOfChange),
          entryCount: Count.make(decoded.entry_count),
        })
      })().pipe(Effect.orDie)

    const getWeightTrend = (params: StatsParams, userId: string) =>
      Effect.fn('StatsService.getWeightTrend')(function* () {
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

        const trajectory = calculateWeightTrajectory(points)
        const trendLineData = trajectory.trendLine
        const trendLine =
          trendLineData === null
            ? null
            : new TrendLine({
                slope: trendLineData.slope,
                intercept: trendLineData.intercept,
                startDate: trendLineData.startDate,
                startWeight: Weight.make(trendLineData.startWeight),
                endDate: trendLineData.endDate,
                endWeight: Weight.make(trendLineData.endWeight),
              })
        yield* Effect.annotateCurrentSpan('pointCount', points.length)

        return new WeightTrendStats({ points, trendLine })
      })().pipe(Effect.orDie)

    const getInjectionSiteStats = (params: StatsParams, userId: string) =>
      Effect.fn('StatsService.getInjectionSiteStats')(function* () {
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
      })().pipe(Effect.orDie)

    const getDosageHistory = (params: StatsParams, userId: string) =>
      Effect.fn('StatsService.getDosageHistory')(function* () {
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
      })().pipe(Effect.orDie)

    const getInjectionFrequency = (params: StatsParams, userId: string) =>
      Effect.fn('StatsService.getInjectionFrequency')(function* () {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const timezone = params.timezone ?? 'UTC'
        const datetimes = yield* listInjectionDatetimes(params, userId)
        const result = buildObservedInjectionFrequency(datetimes, timezone)

        yield* Effect.annotateCurrentSpan('totalInjections', result?.totalInjections ?? 0)
        yield* Effect.annotateCurrentSpan('timezone', timezone)
        return result
      })().pipe(Effect.orDie)

    const getDrugBreakdown = (params: StatsParams, userId: string) =>
      Effect.fn('StatsService.getDrugBreakdown')(function* () {
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
      })().pipe(Effect.orDie)

    const getInjectionByDayOfWeek = (params: StatsParams, userId: string) =>
      Effect.fn('StatsService.getInjectionByDayOfWeek')(function* () {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const timezone = params.timezone ?? 'UTC'
        const datetimes = yield* listInjectionDatetimes(params, userId)
        const result = buildInjectionDayOfWeekStats(datetimes, timezone)

        yield* Effect.annotateCurrentSpan('totalInjections', result.totalInjections)
        yield* Effect.annotateCurrentSpan('timezone', timezone)
        return result
      })().pipe(Effect.orDie)

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
