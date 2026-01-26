/**
 * TUI Data Layer - Reads from local SQLite database (LocalDb service)
 *
 * This module provides data access functions for the TUI that read directly
 * from the local SQLite database instead of making RPC calls. All reads are
 * local; writes still go through the outbox mechanism for background sync.
 */
import { SqlClient } from '@effect/sql'
import type {
  InjectionLog,
  InjectionLogId,
  InjectionSchedule,
  InjectionScheduleId,
  Inventory,
  InventoryId,
  SchedulePhase,
  WeightLog,
  WeightLogId,
} from '@subq/shared'
import { Context, DateTime, Effect, Layer, Option, Schema } from 'effect'

// ============================================
// Database Row Schemas (for parsing SQLite rows)
// ============================================

const WeightLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.String,
  weight: Schema.Number,
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
})

const InjectionLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.String,
  drug: Schema.String,
  source: Schema.NullOr(Schema.String),
  dosage: Schema.String,
  injection_site: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  schedule_id: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
})

const InventoryRow = Schema.Struct({
  id: Schema.String,
  drug: Schema.String,
  source: Schema.String,
  form: Schema.String,
  total_amount: Schema.String,
  status: Schema.String,
  beyond_use_date: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
})

const InjectionScheduleRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  drug: Schema.String,
  source: Schema.NullOr(Schema.String),
  frequency: Schema.String,
  start_date: Schema.String,
  is_active: Schema.Number, // SQLite stores boolean as 0/1
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
})

const SchedulePhaseRow = Schema.Struct({
  id: Schema.String,
  schedule_id: Schema.String,
  order: Schema.Number,
  duration_days: Schema.NullOr(Schema.Number),
  dosage: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
})

const decodeWeightLogRow = Schema.decodeUnknown(WeightLogRow)
const decodeInjectionLogRow = Schema.decodeUnknown(InjectionLogRow)
const decodeInventoryRow = Schema.decodeUnknown(InventoryRow)
const decodeInjectionScheduleRow = Schema.decodeUnknown(InjectionScheduleRow)
const decodeSchedulePhaseRow = Schema.decodeUnknown(SchedulePhaseRow)

// ============================================
// Row to Domain Type Converters
// ============================================

const rowToWeightLog = (row: typeof WeightLogRow.Type): WeightLog => ({
  id: row.id as WeightLogId,
  datetime: DateTime.unsafeMake(new Date(row.datetime)),
  weight: row.weight as WeightLog['weight'],
  notes: row.notes as WeightLog['notes'],
  createdAt: DateTime.unsafeMake(new Date(row.created_at)),
  updatedAt: DateTime.unsafeMake(new Date(row.updated_at)),
})

const rowToInjectionLog = (row: typeof InjectionLogRow.Type): InjectionLog => ({
  id: row.id as InjectionLogId,
  datetime: DateTime.unsafeMake(new Date(row.datetime)),
  drug: row.drug as InjectionLog['drug'],
  source: row.source as InjectionLog['source'],
  dosage: row.dosage as InjectionLog['dosage'],
  injectionSite: row.injection_site as InjectionLog['injectionSite'],
  notes: row.notes as InjectionLog['notes'],
  scheduleId: row.schedule_id as InjectionLog['scheduleId'],
  createdAt: DateTime.unsafeMake(new Date(row.created_at)),
  updatedAt: DateTime.unsafeMake(new Date(row.updated_at)),
})

const rowToInventory = (row: typeof InventoryRow.Type): Inventory => ({
  id: row.id as InventoryId,
  drug: row.drug as Inventory['drug'],
  source: row.source as Inventory['source'],
  form: row.form as Inventory['form'],
  totalAmount: row.total_amount as Inventory['totalAmount'],
  status: row.status as Inventory['status'],
  beyondUseDate: row.beyond_use_date ? DateTime.unsafeMake(new Date(row.beyond_use_date)) : null,
  createdAt: DateTime.unsafeMake(new Date(row.created_at)),
  updatedAt: DateTime.unsafeMake(new Date(row.updated_at)),
})

const rowToSchedulePhase = (row: typeof SchedulePhaseRow.Type): SchedulePhase => ({
  id: row.id as SchedulePhase['id'],
  scheduleId: row.schedule_id as SchedulePhase['scheduleId'],
  order: row.order as SchedulePhase['order'],
  durationDays: row.duration_days as SchedulePhase['durationDays'],
  dosage: row.dosage as SchedulePhase['dosage'],
  createdAt: DateTime.unsafeMake(new Date(row.created_at)),
  updatedAt: DateTime.unsafeMake(new Date(row.updated_at)),
})

const rowToInjectionSchedule = (
  row: typeof InjectionScheduleRow.Type,
  phases: readonly SchedulePhase[],
): InjectionSchedule => ({
  id: row.id as InjectionScheduleId,
  name: row.name as InjectionSchedule['name'],
  drug: row.drug as InjectionSchedule['drug'],
  source: row.source as InjectionSchedule['source'],
  frequency: row.frequency as InjectionSchedule['frequency'],
  startDate: DateTime.unsafeMake(new Date(row.start_date)),
  isActive: row.is_active === 1,
  notes: row.notes as InjectionSchedule['notes'],
  phases: [...phases],
  createdAt: DateTime.unsafeMake(new Date(row.created_at)),
  updatedAt: DateTime.unsafeMake(new Date(row.updated_at)),
})

// ============================================
// Service Interface
// ============================================

export interface TuiDataLayerService {
  /** List weight logs, ordered by datetime desc */
  readonly listWeightLogs: (options?: { limit?: number }) => Effect.Effect<ReadonlyArray<WeightLog>>
  /** Get a weight log by id */
  readonly getWeightLog: (id: WeightLogId) => Effect.Effect<Option.Option<WeightLog>>

  /** List injection logs, ordered by datetime desc */
  readonly listInjectionLogs: (options?: { limit?: number }) => Effect.Effect<ReadonlyArray<InjectionLog>>
  /** Get an injection log by id */
  readonly getInjectionLog: (id: InjectionLogId) => Effect.Effect<Option.Option<InjectionLog>>
  /** Get distinct drug names from injection logs */
  readonly getDistinctDrugs: () => Effect.Effect<ReadonlyArray<string>>
  /** Get distinct injection sites from injection logs */
  readonly getDistinctSites: () => Effect.Effect<ReadonlyArray<string>>

  /** List inventory items, ordered by created_at desc */
  readonly listInventory: (options?: { status?: string }) => Effect.Effect<ReadonlyArray<Inventory>>
  /** Get an inventory item by id */
  readonly getInventory: (id: InventoryId) => Effect.Effect<Option.Option<Inventory>>

  /** List injection schedules with their phases */
  readonly listSchedules: () => Effect.Effect<ReadonlyArray<InjectionSchedule>>
  /** Get a schedule by id with its phases */
  readonly getSchedule: (id: InjectionScheduleId) => Effect.Effect<Option.Option<InjectionSchedule>>
}

export class TuiDataLayer extends Context.Tag('@subq/tui/TuiDataLayer')<TuiDataLayer, TuiDataLayerService>() {
  /**
   * Create layer with provided SqlClient.
   * Expects the database to be initialized (schema exists).
   */
  static readonly layer = Layer.effect(
    TuiDataLayer,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return TuiDataLayer.of(makeTuiDataLayerService(sql))
    }),
  )
}

// ============================================
// Service Implementation
// ============================================

const makeTuiDataLayerService = (sql: SqlClient.SqlClient): TuiDataLayerService => ({
  listWeightLogs: (options) =>
    Effect.gen(function* () {
      const limit = options?.limit ?? 100

      const rows = yield* sql`
        SELECT id, datetime, weight, notes, created_at, updated_at, deleted_at
        FROM weight_logs
        WHERE deleted_at IS NULL
        ORDER BY datetime DESC
        LIMIT ${limit}
      `.pipe(Effect.orDie)

      const results: Array<WeightLog> = []
      for (const row of rows) {
        const decoded = yield* decodeWeightLogRow(row).pipe(Effect.orDie)
        results.push(rowToWeightLog(decoded))
      }

      return results
    }),

  getWeightLog: (id) =>
    Effect.gen(function* () {
      const rows = yield* sql`
        SELECT id, datetime, weight, notes, created_at, updated_at, deleted_at
        FROM weight_logs
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(Effect.orDie)

      if (rows.length === 0) {
        return Option.none()
      }

      const decoded = yield* decodeWeightLogRow(rows[0]).pipe(Effect.orDie)
      return Option.some(rowToWeightLog(decoded))
    }),

  listInjectionLogs: (options) =>
    Effect.gen(function* () {
      const limit = options?.limit ?? 100

      const rows = yield* sql`
        SELECT id, datetime, drug, source, dosage, injection_site, notes, schedule_id, created_at, updated_at, deleted_at
        FROM injection_logs
        WHERE deleted_at IS NULL
        ORDER BY datetime DESC
        LIMIT ${limit}
      `.pipe(Effect.orDie)

      const results: Array<InjectionLog> = []
      for (const row of rows) {
        const decoded = yield* decodeInjectionLogRow(row).pipe(Effect.orDie)
        results.push(rowToInjectionLog(decoded))
      }

      return results
    }),

  getInjectionLog: (id) =>
    Effect.gen(function* () {
      const rows = yield* sql`
        SELECT id, datetime, drug, source, dosage, injection_site, notes, schedule_id, created_at, updated_at, deleted_at
        FROM injection_logs
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(Effect.orDie)

      if (rows.length === 0) {
        return Option.none()
      }

      const decoded = yield* decodeInjectionLogRow(rows[0]).pipe(Effect.orDie)
      return Option.some(rowToInjectionLog(decoded))
    }),

  getDistinctDrugs: () =>
    Effect.gen(function* () {
      const rows = yield* sql`
        SELECT DISTINCT drug FROM injection_logs
        WHERE deleted_at IS NULL
        ORDER BY drug ASC
      `.pipe(Effect.orDie)

      return rows.map((row) => (row as { drug: string }).drug)
    }),

  getDistinctSites: () =>
    Effect.gen(function* () {
      const rows = yield* sql`
        SELECT DISTINCT injection_site FROM injection_logs
        WHERE deleted_at IS NULL AND injection_site IS NOT NULL
        ORDER BY injection_site ASC
      `.pipe(Effect.orDie)

      return rows.map((row) => (row as { injection_site: string }).injection_site)
    }),

  listInventory: (options) =>
    Effect.gen(function* () {
      const status = options?.status

      const rows = status
        ? yield* sql`
            SELECT id, drug, source, form, total_amount, status, beyond_use_date, created_at, updated_at, deleted_at
            FROM glp1_inventory
            WHERE deleted_at IS NULL AND status = ${status}
            ORDER BY created_at DESC
          `.pipe(Effect.orDie)
        : yield* sql`
            SELECT id, drug, source, form, total_amount, status, beyond_use_date, created_at, updated_at, deleted_at
            FROM glp1_inventory
            WHERE deleted_at IS NULL
            ORDER BY created_at DESC
          `.pipe(Effect.orDie)

      const results: Array<Inventory> = []
      for (const row of rows) {
        const decoded = yield* decodeInventoryRow(row).pipe(Effect.orDie)
        results.push(rowToInventory(decoded))
      }

      return results
    }),

  getInventory: (id) =>
    Effect.gen(function* () {
      const rows = yield* sql`
        SELECT id, drug, source, form, total_amount, status, beyond_use_date, created_at, updated_at, deleted_at
        FROM glp1_inventory
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(Effect.orDie)

      if (rows.length === 0) {
        return Option.none()
      }

      const decoded = yield* decodeInventoryRow(rows[0]).pipe(Effect.orDie)
      return Option.some(rowToInventory(decoded))
    }),

  listSchedules: () =>
    Effect.gen(function* () {
      // Get all schedules
      const scheduleRows = yield* sql`
        SELECT id, name, drug, source, frequency, start_date, is_active, notes, created_at, updated_at, deleted_at
        FROM injection_schedules
        WHERE deleted_at IS NULL
        ORDER BY is_active DESC, start_date DESC
      `.pipe(Effect.orDie)

      // Get all phases (for active schedules)
      const phaseRows = yield* sql`
        SELECT id, schedule_id, "order", duration_days, dosage, created_at, updated_at, deleted_at
        FROM schedule_phases
        WHERE deleted_at IS NULL
        ORDER BY "order" ASC
      `.pipe(Effect.orDie)

      // Decode phases and group by schedule_id
      const phasesByScheduleId = new Map<string, SchedulePhase[]>()
      for (const row of phaseRows) {
        const decoded = yield* decodeSchedulePhaseRow(row).pipe(Effect.orDie)
        const phase = rowToSchedulePhase(decoded)
        const phases = phasesByScheduleId.get(decoded.schedule_id) ?? []
        phases.push(phase)
        phasesByScheduleId.set(decoded.schedule_id, phases)
      }

      // Decode schedules and attach phases
      const results: Array<InjectionSchedule> = []
      for (const row of scheduleRows) {
        const decoded = yield* decodeInjectionScheduleRow(row).pipe(Effect.orDie)
        const phases = phasesByScheduleId.get(decoded.id) ?? []
        results.push(rowToInjectionSchedule(decoded, phases))
      }

      return results
    }),

  getSchedule: (id) =>
    Effect.gen(function* () {
      const scheduleRows = yield* sql`
        SELECT id, name, drug, source, frequency, start_date, is_active, notes, created_at, updated_at, deleted_at
        FROM injection_schedules
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(Effect.orDie)

      if (scheduleRows.length === 0) {
        return Option.none()
      }

      const decoded = yield* decodeInjectionScheduleRow(scheduleRows[0]).pipe(Effect.orDie)

      // Get phases for this schedule
      const phaseRows = yield* sql`
        SELECT id, schedule_id, "order", duration_days, dosage, created_at, updated_at, deleted_at
        FROM schedule_phases
        WHERE schedule_id = ${id} AND deleted_at IS NULL
        ORDER BY "order" ASC
      `.pipe(Effect.orDie)

      const phases: Array<SchedulePhase> = []
      for (const row of phaseRows) {
        const phaseDecoded = yield* decodeSchedulePhaseRow(row).pipe(Effect.orDie)
        phases.push(rowToSchedulePhase(phaseDecoded))
      }

      return Option.some(rowToInjectionSchedule(decoded, phases))
    }),
})
