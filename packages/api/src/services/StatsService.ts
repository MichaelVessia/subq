import { SqlClient } from '@effect/sql'
import { Effect, Layer, Schema } from 'effect'
import { DashboardStats, type DashboardStatsParams } from '@scale/shared'

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

// ============================================
// Stats Service Definition
// ============================================

export class StatsService extends Effect.Tag('StatsService')<
  StatsService,
  {
    readonly getDashboardStats: (params: DashboardStatsParams) => Effect.Effect<DashboardStats | null>
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
      getDashboardStats: (params) =>
        Effect.gen(function* () {
          // Single query to get first/last weights and count within date range
          // This is more efficient than fetching all data to the client
          const rows = yield* sql`
            WITH filtered AS (
              SELECT datetime, weight
              FROM weight_logs
              WHERE 1=1
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
    }
  }),
)
