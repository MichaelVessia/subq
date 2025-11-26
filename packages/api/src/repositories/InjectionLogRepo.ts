import { SqlClient } from '@effect/sql'
import {
  Dosage,
  DrugName,
  DrugSource,
  InjectionLog,
  type InjectionLogCreate,
  InjectionLogId,
  type InjectionLogListParams,
  type InjectionLogUpdate,
  InjectionSite,
  Notes,
} from '@scale/shared'
import { Effect, Layer, Option, Schema } from 'effect'

// ============================================
// Database Row Schema
// ============================================

const InjectionLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.DateFromSelf, // pg driver returns Date objects
  drug: Schema.String,
  source: Schema.NullOr(Schema.String),
  dosage: Schema.String,
  injection_site: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.DateFromSelf,
  updated_at: Schema.DateFromSelf,
})

const decodeRow = Schema.decodeUnknown(InjectionLogRow)

// Transform DB row to domain object using branded type constructors
const rowToDomain = (row: typeof InjectionLogRow.Type): InjectionLog =>
  new InjectionLog({
    id: InjectionLogId.make(row.id),
    datetime: row.datetime,
    drug: DrugName.make(row.drug),
    source: row.source ? DrugSource.make(row.source) : null,
    dosage: Dosage.make(row.dosage),
    injectionSite: row.injection_site ? InjectionSite.make(row.injection_site) : null,
    notes: row.notes ? Notes.make(row.notes) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })

const decodeAndTransform = (raw: unknown) => Effect.map(decodeRow(raw), rowToDomain)

// ============================================
// Repository Service Definition
// ============================================

export class InjectionLogRepo extends Effect.Tag('InjectionLogRepo')<
  InjectionLogRepo,
  {
    readonly list: (params: InjectionLogListParams, userId: string) => Effect.Effect<InjectionLog[]>
    readonly findById: (id: string) => Effect.Effect<Option.Option<InjectionLog>>
    readonly create: (data: InjectionLogCreate, userId: string) => Effect.Effect<InjectionLog>
    readonly update: (data: InjectionLogUpdate) => Effect.Effect<InjectionLog>
    readonly delete: (id: string) => Effect.Effect<boolean>
    readonly getUniqueDrugs: (userId: string) => Effect.Effect<string[]>
    readonly getUniqueSites: (userId: string) => Effect.Effect<string[]>
  }
>() {}

// ============================================
// Repository Implementation
// ============================================

export const InjectionLogRepoLive = Layer.effect(
  InjectionLogRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      list: (params, userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT id, datetime, drug, source, dosage, injection_site, notes, created_at, updated_at
            FROM injection_logs
            WHERE user_id = ${userId}
            ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
            ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
            ${params.drug ? sql`AND drug = ${params.drug}` : sql``}
            ORDER BY datetime DESC
            LIMIT ${params.limit}
            OFFSET ${params.offset}
          `
          return yield* Effect.all(rows.map(decodeAndTransform))
        }).pipe(Effect.orDie),

      findById: (id) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT id, datetime, drug, source, dosage, injection_site, notes, created_at, updated_at
            FROM injection_logs
            WHERE id = ${id}
          `
          if (rows.length === 0) return Option.none()
          const decoded = yield* decodeAndTransform(rows[0])
          return Option.some(decoded)
        }).pipe(Effect.orDie),

      create: (data, userId) =>
        Effect.gen(function* () {
          const source = Option.isSome(data.source) ? data.source.value : null
          const injectionSite = Option.isSome(data.injectionSite) ? data.injectionSite.value : null
          const notes = Option.isSome(data.notes) ? data.notes.value : null

          const rows = yield* sql`
            INSERT INTO injection_logs (datetime, drug, source, dosage, injection_site, notes, user_id)
            VALUES (${data.datetime}, ${data.drug}, ${source}, ${data.dosage}, ${injectionSite}, ${notes}, ${userId})
            RETURNING id, datetime, drug, source, dosage, injection_site, notes, created_at, updated_at
          `
          return yield* decodeAndTransform(rows[0])
        }).pipe(Effect.orDie),

      update: (data) =>
        Effect.gen(function* () {
          // First get current values
          const current = yield* sql`
            SELECT id, datetime, drug, source, dosage, injection_site, notes, created_at, updated_at
            FROM injection_logs WHERE id = ${data.id}
          `
          if (current.length === 0) {
            return yield* Effect.die(new Error('InjectionLog not found'))
          }

          const curr = yield* decodeRow(current[0])
          const newDatetime = data.datetime ?? curr.datetime
          const newDrug = data.drug ?? curr.drug
          const newSource = Option.isSome(data.source) ? data.source.value : curr.source
          const newDosage = data.dosage ?? curr.dosage
          const newInjectionSite = Option.isSome(data.injectionSite) ? data.injectionSite.value : curr.injection_site
          const newNotes = Option.isSome(data.notes) ? data.notes.value : curr.notes

          const rows = yield* sql`
            UPDATE injection_logs
            SET datetime = ${newDatetime},
                drug = ${newDrug},
                source = ${newSource},
                dosage = ${newDosage},
                injection_site = ${newInjectionSite},
                notes = ${newNotes},
                updated_at = NOW()
            WHERE id = ${data.id}
            RETURNING id, datetime, drug, source, dosage, injection_site, notes, created_at, updated_at
          `
          return yield* decodeAndTransform(rows[0])
        }).pipe(Effect.orDie),

      delete: (id) =>
        Effect.gen(function* () {
          const result = yield* sql`
            DELETE FROM injection_logs WHERE id = ${id} RETURNING id
          `
          return result.length > 0
        }).pipe(Effect.orDie),

      getUniqueDrugs: (userId) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ drug: string }>`
            SELECT DISTINCT drug FROM injection_logs WHERE user_id = ${userId} ORDER BY drug
          `
          return rows.map((r) => r.drug)
        }).pipe(Effect.orDie),

      getUniqueSites: (userId) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ injection_site: string }>`
            SELECT DISTINCT injection_site 
            FROM injection_logs 
            WHERE user_id = ${userId} AND injection_site IS NOT NULL 
            ORDER BY injection_site
          `
          return rows.map((r) => r.injection_site)
        }).pipe(Effect.orDie),
    }
  }),
)
