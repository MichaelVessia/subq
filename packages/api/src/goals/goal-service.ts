import { SqlClient } from 'effect/unstable/sql'
import { buildGoalProgress, GoalDatabaseError, GoalProgress } from '@subq/shared'
import { Context, DateTime, Effect, Layer, Option, Schema } from 'effect'
import { GoalRepo } from './goal-repo.js'

// ============================================
// Database Row Schemas for Weight Data
// ============================================

const WeightRow = Schema.Struct({
  datetime: Schema.String,
  weight: Schema.Number,
})

const decodeWeightRow = Schema.decodeUnknownEffect(WeightRow)

// ============================================
// Goal Service Definition
// ============================================

export class GoalService extends Context.Service<
  GoalService,
  {
    /** Get most recent weight (used as starting weight if not provided) */
    readonly getMostRecentWeight: (userId: string) => Effect.Effect<Option.Option<number>, GoalDatabaseError>
    /** Get weight at or closest to a specific date */
    readonly getWeightAtDate: (
      userId: string,
      date: DateTime.Utc,
    ) => Effect.Effect<Option.Option<number>, GoalDatabaseError>
    /** Calculate goal progress including projection */
    readonly getGoalProgress: (userId: string) => Effect.Effect<GoalProgress | null, GoalDatabaseError>
  }
>()('GoalService') {}

// ============================================
// Goal Service Implementation
// ============================================

export const GoalServiceLive = Layer.effect(
  GoalService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const goalRepo = yield* GoalRepo

    const getCurrentWeight = (userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT datetime, weight FROM weight_logs
          WHERE user_id = ${userId}
          ORDER BY datetime DESC
          LIMIT 1
        `
        if (rows.length === 0) {
          return Option.none()
        }
        const decoded = yield* decodeWeightRow(rows[0])
        return Option.some(decoded.weight)
      }).pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })))

    const getMostRecentWeight = getCurrentWeight // Same implementation

    const getWeightHistory = (userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT datetime, weight FROM weight_logs
          WHERE user_id = ${userId}
          ORDER BY datetime ASC
        `

        const points: { date: Date; weight: number }[] = []
        for (const row of rows) {
          const decoded = yield* decodeWeightRow(row)
          points.push({ date: new Date(decoded.datetime), weight: decoded.weight })
        }
        return points
      }).pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })))

    const getWeightAtDate = (userId: string, date: DateTime.Utc) =>
      Effect.gen(function* () {
        const dateStr = DateTime.formatIso(date).slice(0, 10)
        // Get weight entry closest to the target date (on or before preferred, else after)
        const rows = yield* sql`
          SELECT datetime, weight FROM weight_logs
          WHERE user_id = ${userId}
          ORDER BY ABS(julianday(date(datetime)) - julianday(${dateStr}))
          LIMIT 1
        `
        if (rows.length === 0) {
          return Option.none()
        }
        const decoded = yield* decodeWeightRow(rows[0])
        return Option.some(decoded.weight)
      }).pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })))

    const getGoalProgress = (userId: string) =>
      Effect.gen(function* () {
        const goalOpt = yield* goalRepo.getActive(userId)
        if (Option.isNone(goalOpt)) {
          return null
        }
        const goal = goalOpt.value

        const currentWeightOpt = yield* getCurrentWeight(userId)
        if (Option.isNone(currentWeightOpt)) {
          return null
        }
        const currentWeight = currentWeightOpt.value

        const now = DateTime.nowUnsafe()
        const weightHistory = yield* getWeightHistory(userId)
        return buildGoalProgress({
          goal,
          currentWeight,
          weightHistory,
          now: new Date(DateTime.toEpochMillis(now)),
        })
      })

    return {
      getMostRecentWeight,
      getWeightAtDate,
      getGoalProgress,
    }
  }),
)
