/**
 * TUI Write Layer - Writes to local SQLite database with outbox for sync
 *
 * This module provides write operations for the TUI that write directly
 * to the local SQLite database and add entries to the sync outbox.
 * All writes are local and return immediately; data syncs in the background.
 */
import { Context, DateTime, Effect, Layer, Option } from 'effect'
import { LocalDb, type LocalDbService, type WriteOperation } from '@subq/local'
import type {
  InjectionLogCreate,
  InjectionLogId,
  InjectionLogUpdate,
  InventoryCreate,
  InventoryId,
  InventoryUpdate,
  WeightLogCreate,
  WeightLogId,
  WeightLogUpdate,
} from '@subq/shared'
import { randomUUID } from 'node:crypto'

// ============================================
// Type for write operations
// ============================================

type SyncedTable =
  | 'weight_logs'
  | 'injection_logs'
  | 'glp1_inventory'
  | 'injection_schedules'
  | 'schedule_phases'
  | 'user_goals'
  | 'user_settings'

// ============================================
// Service Interface
// ============================================

/**
 * TuiWriteLayerService interface
 *
 * All methods return Effects with no requirements (they use Date.now() for
 * timestamps directly, and LocalDb.writeWithOutbox handles its own Clock needs).
 */
export interface TuiWriteLayerService {
  // Weight Log operations
  readonly createWeightLog: (data: WeightLogCreate) => Effect.Effect<{ id: WeightLogId }>
  readonly updateWeightLog: (data: WeightLogUpdate) => Effect.Effect<void>
  readonly deleteWeightLog: (id: WeightLogId) => Effect.Effect<void>

  // Injection Log operations
  readonly createInjectionLog: (data: InjectionLogCreate) => Effect.Effect<{ id: InjectionLogId }>
  readonly updateInjectionLog: (data: InjectionLogUpdate) => Effect.Effect<void>
  readonly deleteInjectionLog: (id: InjectionLogId) => Effect.Effect<void>

  // Inventory operations
  readonly createInventory: (data: InventoryCreate) => Effect.Effect<{ id: InventoryId }>
  readonly updateInventory: (data: InventoryUpdate) => Effect.Effect<void>
  readonly deleteInventory: (id: InventoryId) => Effect.Effect<void>
  readonly markInventoryOpened: (id: InventoryId) => Effect.Effect<void>
  readonly markInventoryFinished: (id: InventoryId) => Effect.Effect<void>
}

export class TuiWriteLayer extends Context.Tag('@subq/tui/TuiWriteLayer')<TuiWriteLayer, TuiWriteLayerService>() {
  /**
   * Create layer with LocalDb dependency.
   * All writes go through LocalDb.writeWithOutbox.
   */
  static readonly layer = Layer.effect(
    TuiWriteLayer,
    Effect.gen(function* () {
      const localDb = yield* LocalDb

      return TuiWriteLayer.of(makeTuiWriteLayerService(localDb))
    }),
  )
}

// ============================================
// Helpers
// ============================================

const toISOString = (dt: DateTime.DateTime): string => DateTime.toDate(dt).toISOString()

const writeToOutbox = (
  localDb: LocalDbService,
  table: SyncedTable,
  id: string,
  operation: WriteOperation,
  payload: Record<string, unknown>,
): Effect.Effect<void> =>
  // LocalDb.writeWithOutbox internally uses Clock, but Effect.runPromise
  // provides the default Clock automatically
  localDb.writeWithOutbox({ table, id, operation, payload }) as Effect.Effect<void>

// ============================================
// Service Implementation
// ============================================

const makeTuiWriteLayerService = (localDb: LocalDbService): TuiWriteLayerService => ({
  createWeightLog: (data) =>
    Effect.sync(() => {
      const nowIso = new Date().toISOString()
      const id = randomUUID() as WeightLogId

      const payload: Record<string, unknown> = {
        id,
        datetime: toISOString(data.datetime),
        weight: data.weight,
        notes: Option.isSome(data.notes) ? data.notes.value : null,
        user_id: null,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      }

      return { id, payload }
    }).pipe(
      Effect.flatMap(({ id, payload }) =>
        writeToOutbox(localDb, 'weight_logs', id, 'insert', payload).pipe(Effect.map(() => ({ id }))),
      ),
    ),

  updateWeightLog: (data) =>
    Effect.sync(() => {
      const nowIso = new Date().toISOString()

      const payload: Record<string, unknown> = {
        updated_at: nowIso,
      }

      if (data.datetime !== undefined) {
        payload.datetime = toISOString(data.datetime)
      }
      if (data.weight !== undefined) {
        payload.weight = data.weight
      }
      if (Option.isSome(data.notes)) {
        payload.notes = data.notes.value
      }

      return payload
    }).pipe(Effect.flatMap((payload) => writeToOutbox(localDb, 'weight_logs', data.id, 'update', payload))),

  deleteWeightLog: (id) => writeToOutbox(localDb, 'weight_logs', id, 'delete', { id }),

  createInjectionLog: (data) =>
    Effect.sync(() => {
      const nowIso = new Date().toISOString()
      const id = randomUUID() as InjectionLogId

      const payload: Record<string, unknown> = {
        id,
        datetime: toISOString(data.datetime),
        drug: data.drug,
        dosage: data.dosage,
        source: Option.isSome(data.source) ? data.source.value : null,
        injection_site: Option.isSome(data.injectionSite) ? data.injectionSite.value : null,
        notes: Option.isSome(data.notes) ? data.notes.value : null,
        schedule_id: Option.isSome(data.scheduleId) ? data.scheduleId.value : null,
        user_id: null,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      }

      return { id, payload }
    }).pipe(
      Effect.flatMap(({ id, payload }) =>
        writeToOutbox(localDb, 'injection_logs', id, 'insert', payload).pipe(Effect.map(() => ({ id }))),
      ),
    ),

  updateInjectionLog: (data) =>
    Effect.sync(() => {
      const nowIso = new Date().toISOString()

      const payload: Record<string, unknown> = {
        updated_at: nowIso,
      }

      if (data.datetime !== undefined) {
        payload.datetime = toISOString(data.datetime)
      }
      if (data.drug !== undefined) {
        payload.drug = data.drug
      }
      if (data.dosage !== undefined) {
        payload.dosage = data.dosage
      }
      if (Option.isSome(data.source)) {
        payload.source = data.source.value
      }
      if (Option.isSome(data.injectionSite)) {
        payload.injection_site = data.injectionSite.value
      }
      if (Option.isSome(data.notes)) {
        payload.notes = data.notes.value
      }
      if (Option.isSome(data.scheduleId)) {
        payload.schedule_id = data.scheduleId.value
      }

      return payload
    }).pipe(Effect.flatMap((payload) => writeToOutbox(localDb, 'injection_logs', data.id, 'update', payload))),

  deleteInjectionLog: (id) => writeToOutbox(localDb, 'injection_logs', id, 'delete', { id }),

  createInventory: (data) =>
    Effect.sync(() => {
      const nowIso = new Date().toISOString()
      const id = randomUUID() as InventoryId

      const payload: Record<string, unknown> = {
        id,
        drug: data.drug,
        source: data.source,
        form: data.form,
        total_amount: data.totalAmount,
        status: data.status,
        beyond_use_date: Option.isSome(data.beyondUseDate) ? toISOString(data.beyondUseDate.value) : null,
        user_id: null,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      }

      return { id, payload }
    }).pipe(
      Effect.flatMap(({ id, payload }) =>
        writeToOutbox(localDb, 'glp1_inventory', id, 'insert', payload).pipe(Effect.map(() => ({ id }))),
      ),
    ),

  updateInventory: (data) =>
    Effect.sync(() => {
      const nowIso = new Date().toISOString()

      const payload: Record<string, unknown> = {
        updated_at: nowIso,
      }

      if (data.drug !== undefined) {
        payload.drug = data.drug
      }
      if (data.source !== undefined) {
        payload.source = data.source
      }
      if (data.form !== undefined) {
        payload.form = data.form
      }
      if (data.totalAmount !== undefined) {
        payload.total_amount = data.totalAmount
      }
      if (data.status !== undefined) {
        payload.status = data.status
      }
      if (Option.isSome(data.beyondUseDate)) {
        payload.beyond_use_date = data.beyondUseDate.value ? toISOString(data.beyondUseDate.value) : null
      }

      return payload
    }).pipe(Effect.flatMap((payload) => writeToOutbox(localDb, 'glp1_inventory', data.id, 'update', payload))),

  deleteInventory: (id) => writeToOutbox(localDb, 'glp1_inventory', id, 'delete', { id }),

  markInventoryOpened: (id) =>
    Effect.sync(() => {
      const nowIso = new Date().toISOString()
      return {
        status: 'opened',
        updated_at: nowIso,
      }
    }).pipe(Effect.flatMap((payload) => writeToOutbox(localDb, 'glp1_inventory', id, 'update', payload))),

  markInventoryFinished: (id) =>
    Effect.sync(() => {
      const nowIso = new Date().toISOString()
      return {
        status: 'finished',
        updated_at: nowIso,
      }
    }).pipe(Effect.flatMap((payload) => writeToOutbox(localDb, 'glp1_inventory', id, 'update', payload))),
})
