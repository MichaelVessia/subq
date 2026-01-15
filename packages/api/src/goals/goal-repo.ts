import { SqlClient } from '@effect/sql'
import {
  GoalDatabaseError,
  GoalId,
  GoalNotFoundError,
  Notes,
  UserGoal,
  type UserGoalCreate,
  type UserGoalUpdate,
  Weight,
} from '@subq/shared'
import { DateTime, Effect, Layer, Option, Schema } from 'effect'

// ============================================
// Database Row Schemas
// ============================================

const GoalRow = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  goal_weight: Schema.Number,
  starting_weight: Schema.Number,
  starting_date: Schema.String,
  target_date: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  is_active: Schema.Number,
  completed_at: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const decodeGoalRow = Schema.decodeUnknown(GoalRow)

const goalRowToDomain = (row: typeof GoalRow.Type): UserGoal =>
  new UserGoal({
    id: GoalId.make(row.id),
    goalWeight: Weight.make(row.goal_weight),
    startingWeight: Weight.make(row.starting_weight),
    startingDate: DateTime.unsafeMake(row.starting_date),
    targetDate: row.target_date ? DateTime.unsafeMake(row.target_date) : null,
    notes: row.notes ? Notes.make(row.notes) : null,
    isActive: row.is_active === 1,
    completedAt: row.completed_at ? DateTime.unsafeMake(row.completed_at) : null,
    createdAt: DateTime.unsafeMake(row.created_at),
    updatedAt: DateTime.unsafeMake(row.updated_at),
  })

const generateUuid = () => crypto.randomUUID()

/**
 * Extract date portion from ISO string. DateTime.formatIso always returns
 * 'YYYY-MM-DDTHH:MM:SS.sssZ' format, so the split is guaranteed to have
 * at least one element.
 */
const extractDatePart = (isoString: string): string => {
  const parts = isoString.split('T')
  return parts[0] ?? isoString
}

// ============================================
// Repository Service Definition
// ============================================

export class GoalRepo extends Effect.Tag('GoalRepo')<
  GoalRepo,
  {
    readonly list: (userId: string) => Effect.Effect<UserGoal[], GoalDatabaseError>
    readonly getActive: (userId: string) => Effect.Effect<Option.Option<UserGoal>, GoalDatabaseError>
    readonly findById: (id: string, userId: string) => Effect.Effect<Option.Option<UserGoal>, GoalDatabaseError>
    readonly create: (
      data: UserGoalCreate,
      startingWeight: number,
      userId: string,
    ) => Effect.Effect<UserGoal, GoalNotFoundError | GoalDatabaseError>
    readonly update: (
      data: UserGoalUpdate,
      userId: string,
    ) => Effect.Effect<UserGoal, GoalNotFoundError | GoalDatabaseError>
    readonly delete: (id: string, userId: string) => Effect.Effect<boolean, GoalDatabaseError>
  }
>() {}

// ============================================
// Repository Implementation
// ============================================

export const GoalRepoLive = Layer.effect(
  GoalRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const list = (userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT id, user_id, goal_weight, starting_weight, starting_date,
                 target_date, notes, is_active, completed_at, created_at, updated_at
          FROM user_goals
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
        `
        const decoded = yield* Effect.all(rows.map((r) => decodeGoalRow(r)))
        return decoded.map(goalRowToDomain)
      }).pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })))

    const getActive = (userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT id, user_id, goal_weight, starting_weight, starting_date,
                 target_date, notes, is_active, completed_at, created_at, updated_at
          FROM user_goals
          WHERE user_id = ${userId} AND is_active = 1
        `
        if (rows.length === 0) {
          return Option.none()
        }
        const decoded = yield* decodeGoalRow(rows[0])
        return Option.some(goalRowToDomain(decoded))
      }).pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })))

    const findById = (id: string, userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT id, user_id, goal_weight, starting_weight, starting_date,
                 target_date, notes, is_active, completed_at, created_at, updated_at
          FROM user_goals
          WHERE id = ${id} AND user_id = ${userId}
        `
        if (rows.length === 0) {
          return Option.none()
        }
        const decoded = yield* decodeGoalRow(rows[0])
        return Option.some(goalRowToDomain(decoded))
      }).pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })))

    const create = (data: UserGoalCreate, startingWeight: number, userId: string) =>
      Effect.gen(function* () {
        const id = generateUuid()
        const now = DateTime.formatIso(DateTime.unsafeNow())
        const startingDate = Option.isSome(data.startingDate)
          ? extractDatePart(DateTime.formatIso(data.startingDate.value))
          : extractDatePart(now)
        const targetDate = Option.isSome(data.targetDate) ? DateTime.formatIso(data.targetDate.value) : null
        const notes = Option.isSome(data.notes) ? data.notes.value : null

        // Deactivate any existing active goals for this user
        yield* sql`UPDATE user_goals SET is_active = 0, updated_at = ${now} WHERE user_id = ${userId} AND is_active = 1`.pipe(
          Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'update', cause })),
        )

        // Create the goal
        yield* sql`
          INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, notes, is_active, created_at, updated_at)
          VALUES (${id}, ${userId}, ${data.goalWeight}, ${startingWeight}, ${startingDate}, ${targetDate}, ${notes}, 1, ${now}, ${now})
        `.pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'insert', cause })))

        // Fetch and return the created goal
        const result = yield* findById(id, userId)
        return yield* Option.match(result, {
          onNone: () => Effect.fail(GoalNotFoundError.make({ id })),
          onSome: (goal) => Effect.succeed(goal),
        })
      })

    const update = (data: UserGoalUpdate, userId: string) =>
      Effect.gen(function* () {
        // First get current values - include user_id check to prevent IDOR
        const current = yield* sql`
          SELECT id, user_id, goal_weight, starting_weight, starting_date,
                 target_date, notes, is_active, completed_at, created_at, updated_at
          FROM user_goals WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })))

        if (current.length === 0) {
          return yield* GoalNotFoundError.make({ id: data.id })
        }

        const curr = yield* decodeGoalRow(current[0]).pipe(
          Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })),
        )

        const now = DateTime.formatIso(DateTime.unsafeNow())

        // Compute new values (use provided or fall back to current)
        const newGoalWeight = data.goalWeight ?? curr.goal_weight
        const newStartingWeight = data.startingWeight ?? curr.starting_weight
        const newStartingDate =
          data.startingDate !== undefined ? extractDatePart(DateTime.formatIso(data.startingDate)) : curr.starting_date
        const newTargetDate =
          data.targetDate !== undefined
            ? data.targetDate === null
              ? null
              : DateTime.formatIso(data.targetDate)
            : curr.target_date
        const newNotes = data.notes !== undefined ? data.notes : curr.notes
        const newIsActive = data.isActive ?? curr.is_active === 1

        // If activating this goal, deactivate others
        if (newIsActive && curr.is_active !== 1) {
          yield* sql`
            UPDATE user_goals SET is_active = 0, updated_at = ${now}
            WHERE user_id = ${userId} AND is_active = 1 AND id != ${data.id}
          `.pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'update', cause })))
        }

        yield* sql`
          UPDATE user_goals
          SET goal_weight = ${newGoalWeight},
              starting_weight = ${newStartingWeight},
              starting_date = ${newStartingDate},
              target_date = ${newTargetDate},
              notes = ${newNotes},
              is_active = ${newIsActive ? 1 : 0},
              updated_at = ${now}
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'update', cause })))

        // Fetch updated
        const result = yield* findById(data.id, userId)
        return yield* Option.match(result, {
          onNone: () => Effect.fail(GoalNotFoundError.make({ id: data.id })),
          onSome: (goal) => Effect.succeed(goal),
        })
      })

    const del = (id: string, userId: string) =>
      Effect.gen(function* () {
        const existing = yield* sql`SELECT id FROM user_goals WHERE id = ${id} AND user_id = ${userId}`
        if (existing.length === 0) {
          return false
        }
        yield* sql`DELETE FROM user_goals WHERE id = ${id} AND user_id = ${userId}`
        return true
      }).pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'delete', cause })))

    return {
      list,
      getActive,
      findById,
      create,
      update,
      delete: del,
    }
  }),
)
