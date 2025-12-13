import { SqlClient } from '@effect/sql'
import { GoalDatabaseError, GoalProgress, type PaceStatus, PercentComplete, type UserGoal, Weight } from '@subq/shared'
import { DateTime, Effect, Layer, Option, Schema } from 'effect'
import { GoalRepo } from './goal-repo.js'

// ============================================
// Database Row Schemas for Weight Data
// ============================================

const WeightRow = Schema.Struct({
  datetime: Schema.String,
  weight: Schema.Number,
})

const decodeWeightRow = Schema.decodeUnknown(WeightRow)

// ============================================
// Goal Service Definition
// ============================================

export class GoalService extends Effect.Tag('GoalService')<
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
>() {}

// ============================================
// Constants
// ============================================

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY
const MAX_PROJECTION_YEARS = 5

// ============================================
// Linear Regression Helper
// ============================================

interface LinearRegressionResult {
  slope: number // lbs per millisecond
  intercept: number
}

function computeLinearRegression(points: { date: DateTime.Utc; weight: number }[]): LinearRegressionResult | null {
  if (points.length < 2) return null

  const n = points.length
  const sumX = points.reduce((acc, p) => acc + DateTime.toEpochMillis(p.date), 0)
  const sumY = points.reduce((acc, p) => acc + p.weight, 0)
  const sumXY = points.reduce((acc, p) => acc + DateTime.toEpochMillis(p.date) * p.weight, 0)
  const sumX2 = points.reduce((acc, p) => acc + DateTime.toEpochMillis(p.date) * DateTime.toEpochMillis(p.date), 0)

  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) return null

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  return { slope, intercept }
}

function computeRateOfChange(points: { date: DateTime.Utc; weight: number }[]): number {
  const regression = computeLinearRegression(points)
  if (!regression) return 0
  return regression.slope * MS_PER_WEEK
}

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
        const dateStr = DateTime.formatIso(date).split('T')[0]!
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
      // Rate of change is lbs per week (negative = losing)
      if (rateOfChange >= 0) {
        // Not losing weight, can't project
        return null
      }

      const remainingLbs = currentWeight - goal.goalWeight
      if (remainingLbs <= 0) {
        // Already at or below goal
        return DateTime.unsafeNow()
      }

      const weeksToGoal = remainingLbs / Math.abs(rateOfChange)
      const msToGoal = weeksToGoal * MS_PER_WEEK
      const now = DateTime.unsafeNow()
      const projectedDate = DateTime.unsafeMake(DateTime.toEpochMillis(now) + msToGoal)

      // Cap at 5 years
      const maxDate = DateTime.unsafeMake(DateTime.toEpochMillis(now) + MAX_PROJECTION_YEARS * 365 * MS_PER_DAY)
      if (DateTime.greaterThan(projectedDate, maxDate)) {
        return null // Too far out to be meaningful
      }

      return projectedDate
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

      const now = DateTime.unsafeNow()
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

        const points: { date: DateTime.Utc; weight: number }[] = []
        for (const row of rows) {
          const decoded = yield* decodeWeightRow(row).pipe(
            Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })),
          )
          points.push({ date: DateTime.unsafeMake(decoded.datetime), weight: decoded.weight })
        }

        const rateOfChange = computeRateOfChange(points)

        const lbsLost = goal.startingWeight - currentWeight
        const totalToLose = goal.startingWeight - goal.goalWeight
        const lbsRemaining = Math.max(0, currentWeight - goal.goalWeight)
        const percentComplete = totalToLose > 0 ? (lbsLost / totalToLose) * 100 : 0

        const projectedDate = calculateProjectedDate(goal, currentWeight, rateOfChange)
        const paceStatus = calculatePaceStatus(goal, currentWeight, rateOfChange)

        const now = DateTime.unsafeNow()
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
