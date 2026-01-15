import { SqlClient } from '@effect/sql'
import {
  Dosage,
  DrugName,
  DrugSource,
  InjectionLog,
  type InjectionLogBulkAssignSchedule,
  type InjectionLogCreate,
  InjectionLogDatabaseError,
  InjectionLogId,
  type InjectionLogListParams,
  InjectionLogNotFoundError,
  type InjectionLogUpdate,
  InjectionScheduleId,
  InjectionSite,
  Notes,
} from '@subq/shared'
import { DateTime, Effect, Layer, Option, Schema } from 'effect'

// ============================================
// Database Row Schema
// ============================================

// Schema for rows as they come from SQLite
// (snake_case columns, ISO strings for dates)
const InjectionLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.String, // SQLite stores as ISO string
  drug: Schema.String,
  source: Schema.NullOr(Schema.String),
  dosage: Schema.String,
  injection_site: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  schedule_id: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const decodeRow = Schema.decodeUnknown(InjectionLogRow)

// Schemas for simple aggregation queries
const DrugRow = Schema.Struct({ drug: Schema.String })
const decodeDrugRows = Schema.decodeUnknown(Schema.Array(DrugRow))

const InjectionSiteRow = Schema.Struct({ injection_site: Schema.String })
const decodeSiteRows = Schema.decodeUnknown(Schema.Array(InjectionSiteRow))

const LastSiteRow = Schema.Struct({ injection_site: Schema.NullOr(Schema.String) })
const decodeLastSiteRows = Schema.decodeUnknown(Schema.Array(LastSiteRow))

// Transform DB row to domain object using branded type constructors
const rowToDomain = (row: typeof InjectionLogRow.Type): InjectionLog =>
  new InjectionLog({
    id: InjectionLogId.make(row.id),
    datetime: DateTime.unsafeMake(row.datetime),
    drug: DrugName.make(row.drug),
    source: row.source ? DrugSource.make(row.source) : null,
    dosage: Dosage.make(row.dosage),
    injectionSite: row.injection_site ? InjectionSite.make(row.injection_site) : null,
    notes: row.notes ? Notes.make(row.notes) : null,
    scheduleId: row.schedule_id ? InjectionScheduleId.make(row.schedule_id) : null,
    createdAt: DateTime.unsafeMake(row.created_at),
    updatedAt: DateTime.unsafeMake(row.updated_at),
  })

const decodeAndTransform = (raw: unknown) => Effect.map(decodeRow(raw), rowToDomain)

// Generate a UUID v4
const generateUuid = () => crypto.randomUUID()

// ============================================
// Repository Service Definition
// ============================================

export class InjectionLogRepo extends Effect.Tag('InjectionLogRepo')<
  InjectionLogRepo,
  {
    readonly list: (
      params: InjectionLogListParams,
      userId: string,
    ) => Effect.Effect<InjectionLog[], InjectionLogDatabaseError>
    readonly findById: (
      id: string,
      userId: string,
    ) => Effect.Effect<Option.Option<InjectionLog>, InjectionLogDatabaseError>
    readonly create: (
      data: InjectionLogCreate,
      userId: string,
    ) => Effect.Effect<InjectionLog, InjectionLogDatabaseError>
    readonly update: (
      data: InjectionLogUpdate,
      userId: string,
    ) => Effect.Effect<InjectionLog, InjectionLogNotFoundError | InjectionLogDatabaseError>
    readonly delete: (id: string, userId: string) => Effect.Effect<boolean, InjectionLogDatabaseError>
    readonly getUniqueDrugs: (userId: string) => Effect.Effect<string[], InjectionLogDatabaseError>
    readonly getUniqueSites: (userId: string) => Effect.Effect<string[], InjectionLogDatabaseError>
    readonly getLastSite: (userId: string) => Effect.Effect<string | null, InjectionLogDatabaseError>
    readonly bulkAssignSchedule: (
      data: InjectionLogBulkAssignSchedule,
      userId: string,
    ) => Effect.Effect<number, InjectionLogDatabaseError>
    readonly listBySchedule: (
      scheduleId: string,
      userId: string,
    ) => Effect.Effect<InjectionLog[], InjectionLogDatabaseError>
  }
>() {}

// ============================================
// Repository Implementation
// ============================================

export const InjectionLogRepoLive = Layer.effect(
  InjectionLogRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const list = (params: InjectionLogListParams, userId: string) =>
      Effect.gen(function* () {
        // Convert DateTime params to ISO strings for SQLite comparison
        const startDateStr = params.startDate ? DateTime.formatIso(params.startDate) : undefined
        const endDateStr = params.endDate ? DateTime.formatIso(params.endDate) : undefined

        const rows = yield* sql`
          SELECT id, datetime, drug, source, dosage, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr ? sql`AND datetime <= ${endDateStr}` : sql``}
          ${params.drug ? sql`AND drug = ${params.drug}` : sql``}
          ORDER BY datetime DESC
          LIMIT ${params.limit}
          OFFSET ${params.offset}
        `
        const results = yield* Effect.all(rows.map(decodeAndTransform))
        return results
      }).pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'query', cause })))

    const findById = (id: string, userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT id, datetime, drug, source, dosage, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs
          WHERE id = ${id} AND user_id = ${userId}
        `
        if (rows.length === 0) return Option.none()
        const decoded = yield* decodeAndTransform(rows[0])
        return Option.some(decoded)
      }).pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'query', cause })))

    const create = (data: InjectionLogCreate, userId: string) =>
      Effect.gen(function* () {
        const id = generateUuid()
        const source = Option.isSome(data.source) ? data.source.value : null
        const injectionSite = Option.isSome(data.injectionSite) ? data.injectionSite.value : null
        const notes = Option.isSome(data.notes) ? data.notes.value : null
        const scheduleId = Option.isSome(data.scheduleId) ? data.scheduleId.value : null
        const now = DateTime.formatIso(DateTime.unsafeNow())
        const datetimeStr = DateTime.formatIso(data.datetime)

        yield* sql`
          INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)
          VALUES (${id}, ${datetimeStr}, ${data.drug}, ${source}, ${data.dosage}, ${injectionSite}, ${notes}, ${scheduleId}, ${userId}, ${now}, ${now})
        `

        // Fetch the inserted row
        const rows = yield* sql`
          SELECT id, datetime, drug, source, dosage, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs
          WHERE id = ${id}
        `
        return yield* decodeAndTransform(rows[0])
      }).pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'insert', cause })))

    const update = (data: InjectionLogUpdate, userId: string) =>
      Effect.gen(function* () {
        // First get current values - include user_id check to prevent IDOR
        const current = yield* sql`
          SELECT id, datetime, drug, source, dosage, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'query', cause })))

        if (current.length === 0) {
          return yield* InjectionLogNotFoundError.make({ id: data.id })
        }

        const curr = yield* decodeRow(current[0]).pipe(
          Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'query', cause })),
        )
        const newDatetime = data.datetime ? DateTime.formatIso(data.datetime) : curr.datetime
        const newDrug = data.drug ?? curr.drug
        const newSource = Option.isSome(data.source) ? data.source.value : curr.source
        const newDosage = data.dosage ?? curr.dosage
        const newInjectionSite = Option.isSome(data.injectionSite) ? data.injectionSite.value : curr.injection_site
        const newNotes = Option.isSome(data.notes) ? data.notes.value : curr.notes
        const newScheduleId = Option.isSome(data.scheduleId) ? data.scheduleId.value : curr.schedule_id
        const now = DateTime.formatIso(DateTime.unsafeNow())

        yield* sql`
          UPDATE injection_logs
          SET datetime = ${newDatetime},
              drug = ${newDrug},
              source = ${newSource},
              dosage = ${newDosage},
              injection_site = ${newInjectionSite},
              notes = ${newNotes},
              schedule_id = ${newScheduleId},
              updated_at = ${now}
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'update', cause })))

        // Fetch updated row
        const rows = yield* sql`
          SELECT id, datetime, drug, source, dosage, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'query', cause })))

        return yield* decodeAndTransform(rows[0]).pipe(
          Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'update', cause })),
        )
      })

    const del = (id: string, userId: string) =>
      Effect.gen(function* () {
        // Check if exists and belongs to user
        const existing = yield* sql`SELECT id FROM injection_logs WHERE id = ${id} AND user_id = ${userId}`
        if (existing.length === 0) {
          return false
        }

        yield* sql`DELETE FROM injection_logs WHERE id = ${id} AND user_id = ${userId}`
        return true
      }).pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'delete', cause })))

    const getUniqueDrugs = (userId: string) =>
      Effect.gen(function* () {
        const rawRows = yield* sql`
          SELECT DISTINCT drug FROM injection_logs WHERE user_id = ${userId} ORDER BY drug
        `
        const rows = yield* decodeDrugRows(rawRows)
        return rows.map((r) => r.drug)
      }).pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'query', cause })))

    const getUniqueSites = (userId: string) =>
      Effect.gen(function* () {
        const rawRows = yield* sql`
          SELECT DISTINCT injection_site
          FROM injection_logs
          WHERE user_id = ${userId} AND injection_site IS NOT NULL
          ORDER BY injection_site
        `
        const rows = yield* decodeSiteRows(rawRows)
        return rows.map((r) => r.injection_site)
      }).pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'query', cause })))

    const getLastSite = (userId: string) =>
      Effect.gen(function* () {
        const rawRows = yield* sql`
          SELECT injection_site
          FROM injection_logs
          WHERE user_id = ${userId}
          ORDER BY datetime DESC
          LIMIT 1
        `
        const rows = yield* decodeLastSiteRows(rawRows)
        const row = rows[0]
        return row ? row.injection_site : null
      }).pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'query', cause })))

    const bulkAssignSchedule = (data: InjectionLogBulkAssignSchedule, userId: string) =>
      Effect.gen(function* () {
        if (data.ids.length === 0) return 0

        const now = DateTime.formatIso(DateTime.unsafeNow())
        const scheduleId = data.scheduleId

        // Build a query that updates all matching IDs for this user
        // Using a loop since @effect/sql doesn't have great support for IN clauses with arrays
        let count = 0
        for (const id of data.ids) {
          const result = yield* sql`
            UPDATE injection_logs
            SET schedule_id = ${scheduleId},
                updated_at = ${now}
            WHERE id = ${id} AND user_id = ${userId}
          `
          // SQLite returns rowsAffected for UPDATE statements
          count += (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0
        }
        return count
      }).pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'update', cause })))

    const listBySchedule = (scheduleId: string, userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT id, datetime, drug, source, dosage, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs
          WHERE schedule_id = ${scheduleId} AND user_id = ${userId}
          ORDER BY datetime ASC
        `
        const results = yield* Effect.all(rows.map(decodeAndTransform))
        return results
      }).pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'query', cause })))

    return {
      list,
      findById,
      create,
      update,
      delete: del,
      getUniqueDrugs,
      getUniqueSites,
      getLastSite,
      bulkAssignSchedule,
      listBySchedule,
    }
  }),
)
