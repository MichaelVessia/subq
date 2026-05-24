import { DateTime } from 'effect'
import { Weight } from '../weight/domain.js'
import {
  calculateWeightTrajectory,
  projectWeightTrajectoryDate,
  type WeightTrajectoryPoint,
} from '../weight/trajectory.js'
import { GoalProgress, type PaceStatus, PercentComplete, type UserGoal } from './domain.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY
const DEFAULT_MAX_PROJECTION_DAYS = 5 * 365

export interface BuildGoalProgressParams {
  readonly goal: UserGoal
  readonly currentWeight: number
  readonly weightHistory: readonly WeightTrajectoryPoint[]
  readonly now: Date
  readonly maxProjectionDays?: number
}

export interface GoalProgressPaceStatusParams {
  readonly goal: UserGoal
  readonly currentWeight: number
  readonly rateOfChange: number
  readonly now: Date
}

export const calculateGoalProgressProjectedDate = ({
  goal,
  currentWeight,
  rateOfChange,
  now,
  maxProjectionDays = DEFAULT_MAX_PROJECTION_DAYS,
}: GoalProgressPaceStatusParams & { readonly maxProjectionDays?: number }): DateTime.Utc | null => {
  const projectedDate = projectWeightTrajectoryDate({
    currentWeight,
    targetWeight: goal.goalWeight,
    rateOfChange,
    now,
    maxProjectionDays,
  })

  return projectedDate === null ? null : DateTime.makeUnsafe(projectedDate.toISOString())
}

export const calculateGoalProgressPaceStatus = ({
  goal,
  currentWeight,
  rateOfChange,
  now,
}: GoalProgressPaceStatusParams): PaceStatus => {
  const remainingLbs = currentWeight - goal.goalWeight
  if (remainingLbs <= 0) {
    return 'ahead'
  }

  if (rateOfChange >= 0) {
    return 'not_losing'
  }

  if (!goal.targetDate) {
    return 'on_track'
  }

  const msRemaining = DateTime.toEpochMillis(goal.targetDate) - now.getTime()
  if (msRemaining <= 0) {
    return 'behind'
  }

  const weeksRemaining = msRemaining / MS_PER_WEEK
  const requiredRate = remainingLbs / weeksRemaining
  const actualRate = Math.abs(rateOfChange)
  const tolerance = 0.1

  if (actualRate >= requiredRate * (1 + tolerance)) {
    return 'ahead'
  }
  if (actualRate >= requiredRate * (1 - tolerance)) {
    return 'on_track'
  }
  return 'behind'
}

export const buildGoalProgress = ({
  goal,
  currentWeight,
  weightHistory,
  now,
  maxProjectionDays,
}: BuildGoalProgressParams): GoalProgress => {
  const trajectory = calculateWeightTrajectory(weightHistory)
  const rateOfChange = trajectory.rateOfChange
  const lbsLost = goal.startingWeight - currentWeight
  const totalToLose = goal.startingWeight - goal.goalWeight
  const lbsRemaining = Math.max(0, currentWeight - goal.goalWeight)
  const percentComplete = totalToLose > 0 ? (lbsLost / totalToLose) * 100 : 0
  const projectedDate =
    maxProjectionDays === undefined
      ? calculateGoalProgressProjectedDate({
          goal,
          currentWeight,
          rateOfChange,
          now,
        })
      : calculateGoalProgressProjectedDate({
          goal,
          currentWeight,
          rateOfChange,
          now,
          maxProjectionDays,
        })
  const paceStatus = calculateGoalProgressPaceStatus({ goal, currentWeight, rateOfChange, now })
  const daysOnPlan = Math.floor((now.getTime() - DateTime.toEpochMillis(goal.startingDate)) / MS_PER_DAY)
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
}
