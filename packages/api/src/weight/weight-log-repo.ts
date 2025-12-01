import { SqlClient } from '@effect/sql'
import {
  Notes,
  Weight,
  WeightLog,
  type WeightLogCreate,
  WeightLogDatabaseError,
  WeightLogId,
  type WeightLogListParams,
  WeightLogNotFoundError,
  type WeightLogUpdate,
} from '@subq/shared'
import { Effect, Layer, Option, Schema } from 'effect'

// ============================================
// Database Row Schema
// ============================================

// Schema for rows as they come from SQLite
// (snake_case columns, ISO strings for dates, numbers for weight)
const WeightLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.String, // SQLite stores as ISO string
  weight: Schema.Number, // SQLite stores as number
  unit: Schema.Literal('lbs', 'kg'),
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const decodeRow = Schema.decodeUnknown(WeightLogRow)

// Transform DB row to domain object using branded type constructors
const rowToDomain = (row: typeof WeightLogRow.Type): WeightLog =>
  new WeightLog({
    id: WeightLogId.make(row.id),
    datetime: new Date(row.datetime),
    weight: Weight.make(row.weight),
    unit: row.unit,
    notes: row.notes ? Notes.make(row.notes) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  })

// Decode and transform raw DB row
const decodeAndTransform = (raw: unknown) => Effect.map(decodeRow(raw), rowToDomain)

// Generate a UUID v4
const generateUuid = () => crypto.randomUUID()

// ============================================
// Repository Service Definition
// ============================================

export class WeightLogRepo extends Effect.Tag('WeightLogRepo')<
  WeightLogRepo,
  {
    readonly list: (params: WeightLogListParams, userId: string) => Effect.Effect<WeightLog[], WeightLogDatabaseError>
    readonly findById: (id: string) => Effect.Effect<Option.Option<WeightLog>, WeightLogDatabaseError>
    readonly create: (data: WeightLogCreate, userId: string) => Effect.Effect<WeightLog, WeightLogDatabaseError>
    readonly update: (
      data: WeightLogUpdate,
    ) => Effect.Effect<WeightLog, WeightLogNotFoundError | WeightLogDatabaseError>
    readonly delete: (id: string) => Effect.Effect<boolean, WeightLogDatabaseError>
  }
>() {}

// ============================================
// Repository Implementation
// ============================================

export const WeightLogRepoLive = Layer.effect(
  WeightLogRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const list = (params: WeightLogListParams, userId: string) =>
      Effect.gen(function* () {
        // Convert Date params to ISO strings for SQLite comparison
        const startDateStr = params.startDate?.toISOString()
        const endDateStr = params.endDate?.toISOString()

        const rows = yield* sql`
          SELECT id, datetime, weight, unit, notes, created_at, updated_at
          FROM weight_logs
          WHERE user_id = ${userId}
          ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
          ORDER BY datetime DESC
          LIMIT ${params.limit}
          OFFSET ${params.offset}
        `
        return yield* Effect.all(rows.map(decodeAndTransform))
      }).pipe(Effect.mapError((cause) => WeightLogDatabaseError.make({ operation: 'query', cause })))

    const findById = (id: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT id, datetime, weight, unit, notes, created_at, updated_at
          FROM weight_logs
          WHERE id = ${id}
        `
        if (rows.length === 0) return Option.none()
        const decoded = yield* decodeAndTransform(rows[0])
        return Option.some(decoded)
      }).pipe(Effect.mapError((cause) => WeightLogDatabaseError.make({ operation: 'query', cause })))

    const create = (data: WeightLogCreate, userId: string) =>
      Effect.gen(function* () {
        const id = generateUuid()
        const notes = Option.isSome(data.notes) ? data.notes.value : null
        const now = new Date().toISOString()
        const datetimeStr = data.datetime.toISOString()

        yield* sql`
          INSERT INTO weight_logs (id, datetime, weight, unit, notes, user_id, created_at, updated_at)
          VALUES (${id}, ${datetimeStr}, ${data.weight}, ${data.unit}, ${notes}, ${userId}, ${now}, ${now})
        `

        // Fetch the inserted row
        const rows = yield* sql`
          SELECT id, datetime, weight, unit, notes, created_at, updated_at
          FROM weight_logs
          WHERE id = ${id}
        `
        return yield* decodeAndTransform(rows[0])
      }).pipe(Effect.mapError((cause) => WeightLogDatabaseError.make({ operation: 'insert', cause })))

    const update = (data: WeightLogUpdate) =>
      Effect.gen(function* () {
        // First get current values
        const current = yield* sql`
          SELECT id, datetime, weight, unit, notes, created_at, updated_at
          FROM weight_logs WHERE id = ${data.id}
        `.pipe(Effect.mapError((cause) => WeightLogDatabaseError.make({ operation: 'query', cause })))

        if (current.length === 0) {
          return yield* WeightLogNotFoundError.make({ id: data.id })
        }

        const curr = yield* decodeRow(current[0]).pipe(
          Effect.mapError((cause) => WeightLogDatabaseError.make({ operation: 'query', cause })),
        )
        const newDatetime = data.datetime ? data.datetime.toISOString() : curr.datetime
        const newWeight = data.weight ?? curr.weight
        const newUnit = data.unit ?? curr.unit
        const newNotes = Option.isSome(data.notes) ? data.notes.value : curr.notes
        const now = new Date().toISOString()

        yield* sql`
          UPDATE weight_logs
          SET datetime = ${newDatetime},
              weight = ${newWeight},
              unit = ${newUnit},
              notes = ${newNotes},
              updated_at = ${now}
          WHERE id = ${data.id}
        `.pipe(Effect.mapError((cause) => WeightLogDatabaseError.make({ operation: 'update', cause })))

        // Fetch updated row
        const rows = yield* sql`
          SELECT id, datetime, weight, unit, notes, created_at, updated_at
          FROM weight_logs
          WHERE id = ${data.id}
        `.pipe(Effect.mapError((cause) => WeightLogDatabaseError.make({ operation: 'query', cause })))

        return yield* decodeAndTransform(rows[0]).pipe(
          Effect.mapError((cause) => WeightLogDatabaseError.make({ operation: 'update', cause })),
        )
      })

    const del = (id: string) =>
      Effect.gen(function* () {
        // Check if exists first
        const existing = yield* sql`SELECT id FROM weight_logs WHERE id = ${id}`
        if (existing.length === 0) {
          return false
        }

        yield* sql`DELETE FROM weight_logs WHERE id = ${id}`
        return true
      }).pipe(Effect.mapError((cause) => WeightLogDatabaseError.make({ operation: 'delete', cause })))

    return {
      list,
      findById,
      create,
      update,
      delete: del,
    }
  }),
)
