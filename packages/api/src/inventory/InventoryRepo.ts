import { SqlClient } from '@effect/sql'
import {
  DrugName,
  DrugSource,
  Inventory,
  type InventoryCreate,
  InventoryDatabaseError,
  InventoryId,
  type InventoryListParams,
  InventoryNotFoundError,
  type InventoryUpdate,
  TotalAmount,
} from '@scale/shared'
import { Effect, Layer, Option, Schema } from 'effect'

// ============================================
// Database Row Schema
// ============================================

const InventoryRow = Schema.Struct({
  id: Schema.String,
  drug: Schema.String,
  source: Schema.String,
  form: Schema.Literal('vial', 'pen'),
  total_amount: Schema.String,
  status: Schema.Literal('new', 'opened', 'finished'),
  beyond_use_date: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const decodeRow = Schema.decodeUnknown(InventoryRow)

const rowToDomain = (row: typeof InventoryRow.Type): Inventory =>
  new Inventory({
    id: InventoryId.make(row.id),
    drug: DrugName.make(row.drug),
    source: DrugSource.make(row.source),
    form: row.form,
    totalAmount: TotalAmount.make(row.total_amount),
    status: row.status,
    beyondUseDate: row.beyond_use_date ? new Date(row.beyond_use_date) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  })

const decodeAndTransform = (raw: unknown) => Effect.map(decodeRow(raw), rowToDomain)

const generateUuid = () => crypto.randomUUID()

// ============================================
// Repository Service Definition
// ============================================

export class InventoryRepo extends Effect.Tag('InventoryRepo')<
  InventoryRepo,
  {
    readonly list: (params: InventoryListParams, userId: string) => Effect.Effect<Inventory[], InventoryDatabaseError>
    readonly findById: (id: string) => Effect.Effect<Option.Option<Inventory>, InventoryDatabaseError>
    readonly create: (data: InventoryCreate, userId: string) => Effect.Effect<Inventory, InventoryDatabaseError>
    readonly update: (
      data: InventoryUpdate,
    ) => Effect.Effect<Inventory, InventoryNotFoundError | InventoryDatabaseError>
    readonly delete: (id: string) => Effect.Effect<boolean, InventoryDatabaseError>
    readonly markFinished: (id: string) => Effect.Effect<Inventory, InventoryNotFoundError | InventoryDatabaseError>
  }
>() {}

// ============================================
// Repository Implementation
// ============================================

export const InventoryRepoLive = Layer.effect(
  InventoryRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      list: (params, userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT id, drug, source, form, total_amount, status, beyond_use_date, created_at, updated_at
            FROM glp1_inventory
            WHERE user_id = ${userId}
            ${params.status ? sql`AND status = ${params.status}` : sql``}
            ${params.drug ? sql`AND drug = ${params.drug}` : sql``}
            ORDER BY created_at DESC
          `
          return yield* Effect.all(rows.map(decodeAndTransform))
        }).pipe(Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'query', cause }))),

      findById: (id) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT id, drug, source, form, total_amount, status, beyond_use_date, created_at, updated_at
            FROM glp1_inventory
            WHERE id = ${id}
          `
          if (rows.length === 0) return Option.none()
          const decoded = yield* decodeAndTransform(rows[0])
          return Option.some(decoded)
        }).pipe(Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'query', cause }))),

      create: (data, userId) =>
        Effect.gen(function* () {
          const id = generateUuid()
          const beyondUseDate = Option.isSome(data.beyondUseDate) ? data.beyondUseDate.value.toISOString() : null
          const now = new Date().toISOString()

          yield* sql`
            INSERT INTO glp1_inventory (id, drug, source, form, total_amount, status, beyond_use_date, user_id, created_at, updated_at)
            VALUES (${id}, ${data.drug}, ${data.source}, ${data.form}, ${data.totalAmount}, ${data.status}, ${beyondUseDate}, ${userId}, ${now}, ${now})
          `

          const rows = yield* sql`
            SELECT id, drug, source, form, total_amount, status, beyond_use_date, created_at, updated_at
            FROM glp1_inventory
            WHERE id = ${id}
          `
          return yield* decodeAndTransform(rows[0])
        }).pipe(Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'insert', cause }))),

      update: (data) =>
        Effect.gen(function* () {
          const current = yield* sql`
            SELECT id, drug, source, form, total_amount, status, beyond_use_date, created_at, updated_at
            FROM glp1_inventory WHERE id = ${data.id}
          `.pipe(Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'query', cause })))

          if (current.length === 0) {
            return yield* InventoryNotFoundError.make({ id: data.id })
          }

          const curr = yield* decodeRow(current[0]).pipe(
            Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'query', cause })),
          )

          const newDrug = data.drug ?? curr.drug
          const newSource = data.source ?? curr.source
          const newForm = data.form ?? curr.form
          const newTotalAmount = data.totalAmount ?? curr.total_amount
          const newStatus = data.status ?? curr.status
          const newBeyondUseDate = Option.isSome(data.beyondUseDate)
            ? (data.beyondUseDate.value?.toISOString() ?? null)
            : curr.beyond_use_date
          const now = new Date().toISOString()

          yield* sql`
            UPDATE glp1_inventory
            SET drug = ${newDrug},
                source = ${newSource},
                form = ${newForm},
                total_amount = ${newTotalAmount},
                status = ${newStatus},
                beyond_use_date = ${newBeyondUseDate},
                updated_at = ${now}
            WHERE id = ${data.id}
          `.pipe(Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'update', cause })))

          const rows = yield* sql`
            SELECT id, drug, source, form, total_amount, status, beyond_use_date, created_at, updated_at
            FROM glp1_inventory
            WHERE id = ${data.id}
          `.pipe(Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'query', cause })))

          return yield* decodeAndTransform(rows[0]).pipe(
            Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'update', cause })),
          )
        }),

      delete: (id) =>
        Effect.gen(function* () {
          const existing = yield* sql`SELECT id FROM glp1_inventory WHERE id = ${id}`
          if (existing.length === 0) return false

          yield* sql`DELETE FROM glp1_inventory WHERE id = ${id}`
          return true
        }).pipe(Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'delete', cause }))),

      markFinished: (id) =>
        Effect.gen(function* () {
          const current = yield* sql`
            SELECT id FROM glp1_inventory WHERE id = ${id}
          `.pipe(Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'query', cause })))

          if (current.length === 0) {
            return yield* InventoryNotFoundError.make({ id })
          }

          const now = new Date().toISOString()
          yield* sql`
            UPDATE glp1_inventory
            SET status = 'finished', updated_at = ${now}
            WHERE id = ${id}
          `.pipe(Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'update', cause })))

          const rows = yield* sql`
            SELECT id, drug, source, form, total_amount, status, beyond_use_date, created_at, updated_at
            FROM glp1_inventory
            WHERE id = ${id}
          `.pipe(Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'query', cause })))

          return yield* decodeAndTransform(rows[0]).pipe(
            Effect.mapError((cause) => InventoryDatabaseError.make({ operation: 'update', cause })),
          )
        }),
    }
  }),
)
