import { SqlClient } from '@effect/sql'
import { Effect, Layer, Option } from 'effect'
import { Schema } from 'effect'
import {
  InjectionLog,
  type InjectionLogCreate,
  type InjectionLogUpdate,
  type InjectionLogListParams,
} from '@scale/shared'

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

const rowToDomain = (row: typeof InjectionLogRow.Type): InjectionLog =>
  new InjectionLog({
    id: row.id,
    datetime: row.datetime,
    drug: row.drug,
    source: row.source,
    dosage: row.dosage,
    injectionSite: row.injection_site,
    notes: row.notes,
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
    readonly list: (params: InjectionLogListParams) => Effect.Effect<InjectionLog[]>
    readonly findById: (id: string) => Effect.Effect<Option.Option<InjectionLog>>
    readonly create: (data: InjectionLogCreate) => Effect.Effect<InjectionLog>
    readonly update: (data: InjectionLogUpdate) => Effect.Effect<InjectionLog>
    readonly delete: (id: string) => Effect.Effect<boolean>
    readonly getUniqueDrugs: () => Effect.Effect<string[]>
    readonly getUniqueSites: () => Effect.Effect<string[]>
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
      list: (params) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT id, datetime, drug, source, dosage, injection_site, notes, created_at, updated_at
            FROM injection_logs
            WHERE 1=1
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

      create: (data) =>
        Effect.gen(function* () {
          const source = Option.isSome(data.source) ? data.source.value : null
          const injectionSite = Option.isSome(data.injectionSite) ? data.injectionSite.value : null
          const notes = Option.isSome(data.notes) ? data.notes.value : null

          const rows = yield* sql`
            INSERT INTO injection_logs (datetime, drug, source, dosage, injection_site, notes)
            VALUES (${data.datetime}, ${data.drug}, ${source}, ${data.dosage}, ${injectionSite}, ${notes})
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

      getUniqueDrugs: () =>
        Effect.gen(function* () {
          const rows = yield* sql<{ drug: string }>`
            SELECT DISTINCT drug FROM injection_logs ORDER BY drug
          `
          return rows.map((r) => r.drug)
        }).pipe(Effect.orDie),

      getUniqueSites: () =>
        Effect.gen(function* () {
          const rows = yield* sql<{ injection_site: string }>`
            SELECT DISTINCT injection_site 
            FROM injection_logs 
            WHERE injection_site IS NOT NULL 
            ORDER BY injection_site
          `
          return rows.map((r) => r.injection_site)
        }).pipe(Effect.orDie),
    }
  }),
)
