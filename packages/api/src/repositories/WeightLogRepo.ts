import { SqlClient } from '@effect/sql'
import { Effect, Layer, Option } from 'effect'
import { Schema } from 'effect'
import { WeightLog, type WeightLogCreate, type WeightLogUpdate, type WeightLogListParams } from '@scale/shared'

// ============================================
// Database Row Schema
// ============================================

// Schema for rows as they come from the database
// (snake_case columns, Date objects from pg driver)
const WeightLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.DateFromSelf, // pg driver returns Date objects
  weight: Schema.NumberFromString, // NUMERIC comes as string from pg
  unit: Schema.Literal('lbs', 'kg'),
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.DateFromSelf,
  updated_at: Schema.DateFromSelf,
})

const decodeRow = Schema.decodeUnknown(WeightLogRow)

// Transform DB row to domain object (after decoding)
const rowToDomain = (row: typeof WeightLogRow.Type): WeightLog =>
  new WeightLog({
    id: row.id,
    datetime: row.datetime,
    weight: row.weight,
    unit: row.unit,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })

// Decode and transform raw DB row
const decodeAndTransform = (raw: unknown) => Effect.map(decodeRow(raw), rowToDomain)

// ============================================
// Repository Service Definition
// ============================================

export class WeightLogRepo extends Effect.Tag('WeightLogRepo')<
  WeightLogRepo,
  {
    readonly list: (params: WeightLogListParams) => Effect.Effect<WeightLog[]>
    readonly findById: (id: string) => Effect.Effect<Option.Option<WeightLog>>
    readonly create: (data: WeightLogCreate) => Effect.Effect<WeightLog>
    readonly update: (data: WeightLogUpdate) => Effect.Effect<WeightLog>
    readonly delete: (id: string) => Effect.Effect<boolean>
  }
>() {}

// ============================================
// Repository Implementation
// ============================================

export const WeightLogRepoLive = Layer.effect(
  WeightLogRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      list: (params) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT id, datetime, weight, unit, notes, created_at, updated_at
            FROM weight_logs
            WHERE 1=1
            ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
            ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
            ORDER BY datetime DESC
            LIMIT ${params.limit}
            OFFSET ${params.offset}
          `
          return yield* Effect.all(rows.map(decodeAndTransform))
        }).pipe(Effect.orDie),

      findById: (id) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT id, datetime, weight, unit, notes, created_at, updated_at
            FROM weight_logs
            WHERE id = ${id}
          `
          if (rows.length === 0) return Option.none()
          const decoded = yield* decodeAndTransform(rows[0])
          return Option.some(decoded)
        }).pipe(Effect.orDie),

      create: (data) =>
        Effect.gen(function* () {
          const notes = Option.isSome(data.notes) ? data.notes.value : null

          const rows = yield* sql`
            INSERT INTO weight_logs (datetime, weight, unit, notes)
            VALUES (${data.datetime}, ${data.weight}, ${data.unit}, ${notes})
            RETURNING id, datetime, weight, unit, notes, created_at, updated_at
          `
          return yield* decodeAndTransform(rows[0])
        }).pipe(Effect.orDie),

      update: (data) =>
        Effect.gen(function* () {
          // First get current values
          const current = yield* sql`
            SELECT id, datetime, weight, unit, notes, created_at, updated_at
            FROM weight_logs WHERE id = ${data.id}
          `
          if (current.length === 0) {
            return yield* Effect.die(new Error('WeightLog not found'))
          }

          const curr = yield* decodeRow(current[0])
          const newDatetime = data.datetime ?? curr.datetime
          const newWeight = data.weight ?? curr.weight
          const newUnit = data.unit ?? curr.unit
          const newNotes = Option.isSome(data.notes) ? data.notes.value : curr.notes

          const rows = yield* sql`
            UPDATE weight_logs
            SET datetime = ${newDatetime},
                weight = ${newWeight},
                unit = ${newUnit},
                notes = ${newNotes},
                updated_at = NOW()
            WHERE id = ${data.id}
            RETURNING id, datetime, weight, unit, notes, created_at, updated_at
          `
          return yield* decodeAndTransform(rows[0])
        }).pipe(Effect.orDie),

      delete: (id) =>
        Effect.gen(function* () {
          const result = yield* sql`
            DELETE FROM weight_logs WHERE id = ${id} RETURNING id
          `
          return result.length > 0
        }).pipe(Effect.orDie),
    }
  }),
)
