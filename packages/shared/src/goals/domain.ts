import { Schema } from 'effect'
import { Notes } from '../common/domain.js'
import { Weight } from '../weight/domain.js'

// ============================================
// Goals Domain Entity IDs
// ============================================

/** UUID identifier for user goals */
export const GoalId = Schema.String.pipe(Schema.brand('GoalId'))
export type GoalId = typeof GoalId.Type

// ============================================
// Goals Domain Primitives
// ============================================

/** Pace status relative to projected goal */
export const PaceStatus = Schema.Literal('on_track', 'ahead', 'behind', 'not_losing')
export type PaceStatus = typeof PaceStatus.Type

/** Percentage complete (0-100+) */
export const PercentComplete = Schema.Number.pipe(Schema.brand('PercentComplete'))
export type PercentComplete = typeof PercentComplete.Type

// ============================================
// User Goal - the target weight
// ============================================

/**
 * A user goal tracks the target weight and starting point.
 * Only one goal can be active at a time per user.
 */
export class UserGoal extends Schema.Class<UserGoal>('UserGoal')({
  id: GoalId,
  goalWeight: Weight,
  startingWeight: Weight,
  startingDate: Schema.Date,
  targetDate: Schema.NullOr(Schema.Date),
  notes: Schema.NullOr(Notes),
  isActive: Schema.Boolean,
  completedAt: Schema.NullOr(Schema.Date),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

// ============================================
// Input Types
// ============================================

/**
 * Payload for creating a new goal.
 * startingWeight is optional - if not provided, uses most recent weight log.
 */
export class UserGoalCreate extends Schema.Class<UserGoalCreate>('UserGoalCreate')({
  goalWeight: Weight,
  startingWeight: Schema.optional(Weight),
  targetDate: Schema.optionalWith(Schema.Date, { as: 'Option' }),
  notes: Schema.optionalWith(Notes, { as: 'Option' }),
}) {}

/**
 * Payload for updating an existing goal.
 */
export class UserGoalUpdate extends Schema.Class<UserGoalUpdate>('UserGoalUpdate')({
  id: GoalId,
  goalWeight: Schema.optional(Weight),
  targetDate: Schema.optional(Schema.NullOr(Schema.Date)),
  notes: Schema.optional(Schema.NullOr(Notes)),
  isActive: Schema.optional(Schema.Boolean),
}) {}

/**
 * Payload for deleting a goal.
 */
export class UserGoalDelete extends Schema.Class<UserGoalDelete>('UserGoalDelete')({
  id: GoalId,
}) {}

// ============================================
// Goal Progress Types
// ============================================

/**
 * Progress summary for a goal including projection.
 */
export class GoalProgress extends Schema.Class<GoalProgress>('GoalProgress')({
  goal: UserGoal,
  currentWeight: Weight,
  lbsLost: Schema.Number,
  lbsRemaining: Schema.Number,
  percentComplete: PercentComplete,
  projectedDate: Schema.NullOr(Schema.Date),
  paceStatus: PaceStatus,
  daysOnPlan: Schema.Number,
  avgLbsPerWeek: Schema.Number,
}) {}
