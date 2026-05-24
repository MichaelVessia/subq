import { SqlClient } from 'effect/unstable/sql'
import {
  calculateWeightTrajectory,
  GoalDatabaseError,
  GoalProgress,
  type PaceStatus,
  PercentComplete,
  projectWeightTrajectoryDate,
  type UserGoal,
  Weight,
} from '@subq/shared'
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
    /** Get current weight for goal progress calculation */
    readonly getCurrentWeight: (userId: string) => Effect.Effect<Option.Option<number>, GoalDatabaseError>
    /** Get most recent weight (used as starting weight if not provided) */
    readonly getMostRecentWeight: (userId: string) => Effect.Effect<Option.Option<number>, GoalDatabaseError>
    /** Get weight at or closest to a specific date */
    readonly getWeightAtDate: (
      userId: string,
      date: DateTime.Utc,
    ) => Effect.Effect<Option.Option<number>, GoalDatabaseError>
    /** Calculate goal progress including projection */
    readonly getGoalProgress: (userId: string) => Effect.Effect<GoalProgress | null, GoalDatabaseError>
    /** Calculate projected goal date based on rate of change */
    readonly calculateProjectedDate: (
      goal: UserGoal,
      currentWeight: number,
      rateOfChange: number,
    ) => DateTime.Utc | null
    /** Calculate pace status */
    readonly calculatePaceStatus: (goal: UserGoal, currentWeight: number, rateOfChange: number) => PaceStatus
  }
>()('GoalService') {}

// ============================================
// Constants
// ============================================

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY
const MAX_PROJECTION_YEARS = 5

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

    const calculateProjectedDate = (
      goal: UserGoal,
      currentWeight: number,
      rateOfChange: number,
    ): DateTime.Utc | null => {
      const now = DateTime.nowUnsafe()
      const projectedDate = projectWeightTrajectoryDate({
        currentWeight,
        targetWeight: goal.goalWeight,
        rateOfChange,
        now: new Date(DateTime.toEpochMillis(now)),
        maxProjectionDays: MAX_PROJECTION_YEARS * 365,
      })
      return projectedDate === null ? null : DateTime.makeUnsafe(projectedDate.toISOString())
    }

    const calculatePaceStatus = (goal: UserGoal, currentWeight: number, rateOfChange: number): PaceStatus => {
      // If not losing weight
      if (rateOfChange >= 0) {
        return 'not_losing'
      }

      // If no target date, just check if losing
      if (!goal.targetDate) {
        return rateOfChange < 0 ? 'on_track' : 'not_losing'
      }

      // Calculate required rate to hit target
      const remainingLbs = currentWeight - goal.goalWeight
      if (remainingLbs <= 0) {
        return 'ahead' // Already at goal
      }

      const now = DateTime.nowUnsafe()
      const msRemaining = DateTime.toEpochMillis(goal.targetDate) - DateTime.toEpochMillis(now)
      if (msRemaining <= 0) {
        return 'behind' // Target date passed
      }

      const weeksRemaining = msRemaining / MS_PER_WEEK
      const requiredRate = remainingLbs / weeksRemaining // lbs per week needed

      const actualRate = Math.abs(rateOfChange)

      // 10% tolerance
      const tolerance = 0.1
      if (actualRate >= requiredRate * (1 + tolerance)) {
        return 'ahead'
      }
      if (actualRate >= requiredRate * (1 - tolerance)) {
        return 'on_track'
      }
      return 'behind'
    }

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

        // Get weight history for rate calculation
        const rows = yield* sql`
          SELECT datetime, weight FROM weight_logs
          WHERE user_id = ${userId}
          ORDER BY datetime ASC
        `.pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })))

        const points: { date: Date; weight: number }[] = []
        for (const row of rows) {
          const decoded = yield* decodeWeightRow(row).pipe(
            Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })),
          )
          points.push({ date: new Date(decoded.datetime), weight: decoded.weight })
        }

        const trajectory = calculateWeightTrajectory(points)
        const rateOfChange = trajectory.rateOfChange

        const lbsLost = goal.startingWeight - currentWeight
        const totalToLose = goal.startingWeight - goal.goalWeight
        const lbsRemaining = Math.max(0, currentWeight - goal.goalWeight)
        const percentComplete = totalToLose > 0 ? (lbsLost / totalToLose) * 100 : 0

        const projectedDate = calculateProjectedDate(goal, currentWeight, rateOfChange)
        const paceStatus = calculatePaceStatus(goal, currentWeight, rateOfChange)

        const now = DateTime.nowUnsafe()
        const daysOnPlan = Math.floor(
          (DateTime.toEpochMillis(now) - DateTime.toEpochMillis(goal.startingDate)) / MS_PER_DAY,
        )
        // Use the linear regression rate (from all weight history) as the avg rate
        // rateOfChange is negative when losing, so negate for display as positive loss rate
        const avgLbsPerWeek = rateOfChange < 0 ? Math.abs(rateOfChange) : 0

        return new GoalProgress({
          goal,
          currentWeight: Weight.make(currentWeight),
          lbsLost,
          lbsRemaining,
          percentComplete: PercentComplete.make(percentComplete),
          projectedDate,
          paceStatus,
          daysOnPlan,
          avgLbsPerWeek,
        })
      })

    return {
      getCurrentWeight,
      getMostRecentWeight,
      getWeightAtDate,
      getGoalProgress,
      calculateProjectedDate,
      calculatePaceStatus,
    }
  }),
)
