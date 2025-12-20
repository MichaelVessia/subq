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
    ) => Effect.Effect<UserGoal, GoalDatabaseError>
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
          ? DateTime.formatIso(data.startingDate.value).split('T')[0]!
          : now.split('T')[0]! // Just the date part
        const targetDate = Option.isSome(data.targetDate) ? DateTime.formatIso(data.targetDate.value) : null
        const notes = Option.isSome(data.notes) ? data.notes.value : null

        // Deactivate any existing active goals for this user
        yield* sql`UPDATE user_goals SET is_active = 0, updated_at = ${now} WHERE user_id = ${userId} AND is_active = 1`

        // Create the goal
        yield* sql`
          INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, notes, is_active, created_at, updated_at)
          VALUES (${id}, ${userId}, ${data.goalWeight}, ${startingWeight}, ${startingDate}, ${targetDate}, ${notes}, 1, ${now}, ${now})
        `

        // Fetch and return the created goal
        const result = yield* findById(id, userId)
        return Option.getOrThrow(result)
      }).pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'insert', cause })))

    const update = (data: UserGoalUpdate, userId: string) =>
      Effect.gen(function* () {
        // First check if goal exists and belongs to user
        const existing =
          yield* sql`SELECT id, user_id FROM user_goals WHERE id = ${data.id} AND user_id = ${userId}`.pipe(
            Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })),
          )

        if (existing.length === 0) {
          return yield* GoalNotFoundError.make({ id: data.id })
        }

        const now = DateTime.formatIso(DateTime.unsafeNow())

        // If activating this goal, deactivate others
        if (data.isActive === true) {
          yield* sql`
            UPDATE user_goals SET is_active = 0, updated_at = ${now} 
            WHERE user_id = ${userId} AND is_active = 1 AND id != ${data.id}
          `.pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'update', cause })))
        }

        // Build update dynamically
        const updates: string[] = [`updated_at = '${now}'`]
        if (data.goalWeight !== undefined) {
          updates.push(`goal_weight = ${data.goalWeight}`)
        }
        if (data.startingWeight !== undefined) {
          updates.push(`starting_weight = ${data.startingWeight}`)
        }
        if (data.startingDate !== undefined) {
          const val = DateTime.formatIso(data.startingDate).split('T')[0]!
          updates.push(`starting_date = '${val}'`)
        }
        if (data.targetDate !== undefined) {
          const val = data.targetDate === null ? 'NULL' : `'${DateTime.formatIso(data.targetDate)}'`
          updates.push(`target_date = ${val}`)
        }
        if (data.notes !== undefined) {
          const val = data.notes === null ? 'NULL' : `'${data.notes}'`
          updates.push(`notes = ${val}`)
        }
        if (data.isActive !== undefined) {
          updates.push(`is_active = ${data.isActive ? 1 : 0}`)
        }

        yield* sql
          .unsafe(`UPDATE user_goals SET ${updates.join(', ')} WHERE id = '${data.id}' AND user_id = '${userId}'`)
          .pipe(Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'update', cause })))

        // Fetch updated
        const result = yield* findById(data.id, userId).pipe(
          Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause })),
        )
        return Option.getOrThrow(result)
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
