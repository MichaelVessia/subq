import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema } from 'effect'
import { GoalId, GoalProgress, UserGoal, UserGoalCreate, UserGoalDelete, UserGoalUpdate } from './domain.js'

// ============================================
// Goals Errors
// ============================================

export class GoalNotFoundError extends Schema.TaggedError<GoalNotFoundError>()('GoalNotFoundError', {
  id: Schema.String,
}) {}

export class GoalDatabaseError extends Schema.TaggedError<GoalDatabaseError>()('GoalDatabaseError', {
  operation: Schema.Literal('insert', 'update', 'delete', 'query'),
  cause: Schema.Defect,
}) {}

export class NoWeightDataError extends Schema.TaggedError<NoWeightDataError>()('NoWeightDataError', {}) {}

// ============================================
// Goals RPCs
// ============================================

export const GoalRpcs = RpcGroup.make(
  Rpc.make('GoalGetActive', {
    success: Schema.NullOr(UserGoal),
    error: GoalDatabaseError,
  }),
  Rpc.make('GoalGet', {
    payload: Schema.Struct({ id: GoalId }),
    success: Schema.NullOr(UserGoal),
    error: GoalDatabaseError,
  }),
  Rpc.make('GoalList', {
    success: Schema.Array(UserGoal),
    error: GoalDatabaseError,
  }),
  Rpc.make('GoalCreate', {
    payload: UserGoalCreate,
    success: UserGoal,
    error: Schema.Union(GoalDatabaseError, NoWeightDataError),
  }),
  Rpc.make('GoalUpdate', {
    payload: UserGoalUpdate,
    success: UserGoal,
    error: Schema.Union(GoalNotFoundError, GoalDatabaseError),
  }),
  Rpc.make('GoalDelete', {
    payload: UserGoalDelete,
    success: Schema.Boolean,
    error: GoalDatabaseError,
  }),
  Rpc.make('GoalGetProgress', {
    success: Schema.NullOr(GoalProgress),
    error: GoalDatabaseError,
  }),
)
