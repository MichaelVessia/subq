/**
 * Tests for TUI Data Layer - verifies reading from local SQLite database
 *
 * These tests verify:
 * - TUI data layer reads from local DB
 * - Empty local DB returns empty lists
 * - Local data renders in expected format
 */
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Layer, Option } from 'effect'
import { TuiDataLayer } from '../src/services/data-layer.js'

// ============================================
// Test Database Setup
// ============================================

const SqliteTestLayer = SqliteClient.layer({ filename: ':memory:' })

const setupTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE IF NOT EXISTS weight_logs (
      id TEXT PRIMARY KEY,
      datetime TEXT NOT NULL,
      weight REAL NOT NULL,
      notes TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `

  yield* sql`
    CREATE TABLE IF NOT EXISTS injection_logs (
      id TEXT PRIMARY KEY,
      datetime TEXT NOT NULL,
      drug TEXT NOT NULL,
      source TEXT,
      dosage TEXT NOT NULL,
      injection_site TEXT,
      notes TEXT,
      schedule_id TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `

  yield* sql`
    CREATE TABLE IF NOT EXISTS glp1_inventory (
      id TEXT PRIMARY KEY,
      drug TEXT NOT NULL,
      source TEXT NOT NULL,
      form TEXT NOT NULL,
      total_amount TEXT NOT NULL,
      status TEXT NOT NULL,
      beyond_use_date TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `

  yield* sql`
    CREATE TABLE IF NOT EXISTS injection_schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      drug TEXT NOT NULL,
      source TEXT,
      frequency TEXT NOT NULL,
      start_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `

  yield* sql`
    CREATE TABLE IF NOT EXISTS schedule_phases (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      duration_days INTEGER,
      dosage TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `
})

const clearTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`DELETE FROM schedule_phases`
  yield* sql`DELETE FROM injection_logs`
  yield* sql`DELETE FROM injection_schedules`
  yield* sql`DELETE FROM weight_logs`
  yield* sql`DELETE FROM glp1_inventory`
})

// ============================================
// Insert Helpers
// ============================================

const insertWeightLog = (id: string, datetime: Date, weight: number, notes: string | null = null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
      VALUES (${id}, ${datetime.toISOString()}, ${weight}, ${notes}, 'user-1', ${now}, ${now})
    `
  })

const insertInjectionLog = (
  id: string,
  datetime: Date,
  drug: string,
  dosage: string,
  site: string | null = null,
  source: string | null = null,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, user_id, created_at, updated_at)
      VALUES (${id}, ${datetime.toISOString()}, ${drug}, ${source}, ${dosage}, ${site}, null, 'user-1', ${now}, ${now})
    `
  })

const insertInventory = (id: string, drug: string, source: string, form: string, totalAmount: string, status: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO glp1_inventory (id, drug, source, form, total_amount, status, user_id, created_at, updated_at)
      VALUES (${id}, ${drug}, ${source}, ${form}, ${totalAmount}, ${status}, 'user-1', ${now}, ${now})
    `
  })

const insertSchedule = (id: string, name: string, drug: string, frequency: string, startDate: Date, isActive = 1) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO injection_schedules (id, name, drug, frequency, start_date, is_active, user_id, created_at, updated_at)
      VALUES (${id}, ${name}, ${drug}, ${frequency}, ${startDate.toISOString()}, ${isActive}, 'user-1', ${now}, ${now})
    `
  })

const insertSchedulePhase = (
  id: string,
  scheduleId: string,
  order: number,
  dosage: string,
  durationDays: number | null = null,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)
      VALUES (${id}, ${scheduleId}, ${order}, ${durationDays}, ${dosage}, ${now}, ${now})
    `
  })

const softDeleteWeightLog = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`UPDATE weight_logs SET deleted_at = ${now} WHERE id = ${id}`
  })

// ============================================
// Test Layer Builder
// ============================================

const makeTestLayer = () =>
  Layer.effectDiscard(setupTables.pipe(Effect.andThen(clearTables))).pipe(
    Layer.provideMerge(TuiDataLayer.layer.pipe(Layer.provideMerge(SqliteTestLayer))),
    Layer.fresh,
  )

// ============================================
// Tests
// ============================================

describe('TuiDataLayer', () => {
  describe('listWeightLogs', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('reads weight logs from local DB', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-1', new Date('2024-01-15T10:00:00Z'), 185.5, 'Morning')
          yield* insertWeightLog('wl-2', new Date('2024-01-16T10:00:00Z'), 184.0, null)

          const dataLayer = yield* TuiDataLayer
          const logs = yield* dataLayer.listWeightLogs()

          expect(logs.length).toBe(2)
          // Should be ordered by datetime DESC
          expect(logs[0]?.weight).toBe(184.0)
          expect(logs[1]?.weight).toBe(185.5)
          expect(logs[1]?.notes).toBe('Morning')
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('returns empty list for empty local DB', () =>
        Effect.gen(function* () {
          const dataLayer = yield* TuiDataLayer
          const logs = yield* dataLayer.listWeightLogs()

          expect(logs.length).toBe(0)
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('excludes soft-deleted records', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-1', new Date('2024-01-15T10:00:00Z'), 185.5)
          yield* insertWeightLog('wl-2', new Date('2024-01-16T10:00:00Z'), 184.0)
          yield* softDeleteWeightLog('wl-1')

          const dataLayer = yield* TuiDataLayer
          const logs = yield* dataLayer.listWeightLogs()

          expect(logs.length).toBe(1)
          expect(logs[0]?.id).toBe('wl-2')
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('respects limit parameter', () =>
        Effect.gen(function* () {
          for (let i = 0; i < 5; i++) {
            yield* insertWeightLog(`wl-${i}`, new Date(`2024-01-${15 + i}T10:00:00Z`), 180 + i)
          }

          const dataLayer = yield* TuiDataLayer
          const logs = yield* dataLayer.listWeightLogs({ limit: 3 })

          expect(logs.length).toBe(3)
        }),
      )
    })
  })

  describe('listInjectionLogs', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('reads injection logs from local DB', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog(
            'inj-1',
            new Date('2024-01-15T10:00:00Z'),
            'Semaglutide',
            '0.5mg',
            'Left abdomen',
            'Pharmacy A',
          )
          yield* insertInjectionLog('inj-2', new Date('2024-01-16T10:00:00Z'), 'Tirzepatide', '2.5mg', 'Right abdomen')

          const dataLayer = yield* TuiDataLayer
          const logs = yield* dataLayer.listInjectionLogs()

          expect(logs.length).toBe(2)
          // Should be ordered by datetime DESC
          expect(logs[0]?.drug).toBe('Tirzepatide')
          expect(logs[0]?.dosage).toBe('2.5mg')
          expect(logs[1]?.drug).toBe('Semaglutide')
          expect(logs[1]?.source).toBe('Pharmacy A')
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('returns empty list for empty local DB', () =>
        Effect.gen(function* () {
          const dataLayer = yield* TuiDataLayer
          const logs = yield* dataLayer.listInjectionLogs()

          expect(logs.length).toBe(0)
        }),
      )
    })
  })

  describe('getDistinctDrugs', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('returns distinct drug names', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Semaglutide', '0.5mg')
          yield* insertInjectionLog('inj-2', new Date('2024-01-16T10:00:00Z'), 'Tirzepatide', '2.5mg')
          yield* insertInjectionLog('inj-3', new Date('2024-01-17T10:00:00Z'), 'Semaglutide', '1.0mg')

          const dataLayer = yield* TuiDataLayer
          const drugs = yield* dataLayer.getDistinctDrugs()

          expect(drugs.length).toBe(2)
          expect(drugs).toContain('Semaglutide')
          expect(drugs).toContain('Tirzepatide')
        }),
      )
    })
  })

  describe('getDistinctSites', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('returns distinct injection sites', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Semaglutide', '0.5mg', 'Left abdomen')
          yield* insertInjectionLog('inj-2', new Date('2024-01-16T10:00:00Z'), 'Semaglutide', '0.5mg', 'Right abdomen')
          yield* insertInjectionLog('inj-3', new Date('2024-01-17T10:00:00Z'), 'Semaglutide', '0.5mg', 'Left abdomen')

          const dataLayer = yield* TuiDataLayer
          const sites = yield* dataLayer.getDistinctSites()

          expect(sites.length).toBe(2)
          expect(sites).toContain('Left abdomen')
          expect(sites).toContain('Right abdomen')
        }),
      )
    })
  })

  describe('listInventory', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('reads inventory from local DB', () =>
        Effect.gen(function* () {
          yield* insertInventory('inv-1', 'Semaglutide', 'Empower', 'vial', '10mg', 'new')
          yield* insertInventory('inv-2', 'Tirzepatide', 'Hallandale', 'pen', '5mg', 'opened')

          const dataLayer = yield* TuiDataLayer
          const items = yield* dataLayer.listInventory()

          expect(items.length).toBe(2)
          expect(items.some((i) => i.drug === 'Semaglutide')).toBe(true)
          expect(items.some((i) => i.drug === 'Tirzepatide')).toBe(true)
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('returns empty list for empty local DB', () =>
        Effect.gen(function* () {
          const dataLayer = yield* TuiDataLayer
          const items = yield* dataLayer.listInventory()

          expect(items.length).toBe(0)
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('filters by status', () =>
        Effect.gen(function* () {
          yield* insertInventory('inv-1', 'Semaglutide', 'Empower', 'vial', '10mg', 'new')
          yield* insertInventory('inv-2', 'Tirzepatide', 'Hallandale', 'pen', '5mg', 'opened')
          yield* insertInventory('inv-3', 'Retatrutide', 'Empower', 'vial', '10mg', 'new')

          const dataLayer = yield* TuiDataLayer
          const newItems = yield* dataLayer.listInventory({ status: 'new' })

          expect(newItems.length).toBe(2)
          expect(newItems.every((i) => i.status === 'new')).toBe(true)
        }),
      )
    })
  })

  describe('listSchedules', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('reads schedules with phases from local DB', () =>
        Effect.gen(function* () {
          yield* insertSchedule('sch-1', 'My Protocol', 'Semaglutide', 'weekly', new Date('2024-01-01'))
          yield* insertSchedulePhase('ph-1', 'sch-1', 1, '0.25mg', 28)
          yield* insertSchedulePhase('ph-2', 'sch-1', 2, '0.5mg', 28)

          const dataLayer = yield* TuiDataLayer
          const schedules = yield* dataLayer.listSchedules()

          expect(schedules.length).toBe(1)
          expect(schedules[0]?.name).toBe('My Protocol')
          expect(schedules[0]?.phases.length).toBe(2)
          expect(schedules[0]?.phases[0]?.dosage).toBe('0.25mg')
          expect(schedules[0]?.phases[1]?.dosage).toBe('0.5mg')
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('returns empty list for empty local DB', () =>
        Effect.gen(function* () {
          const dataLayer = yield* TuiDataLayer
          const schedules = yield* dataLayer.listSchedules()

          expect(schedules.length).toBe(0)
        }),
      )
    })
  })

  describe('getSchedule', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('returns schedule by id with phases', () =>
        Effect.gen(function* () {
          yield* insertSchedule('sch-1', 'My Protocol', 'Semaglutide', 'weekly', new Date('2024-01-01'))
          yield* insertSchedulePhase('ph-1', 'sch-1', 1, '0.25mg', 28)
          yield* insertSchedulePhase('ph-2', 'sch-1', 2, '0.5mg')

          const dataLayer = yield* TuiDataLayer
          const schedule = yield* dataLayer.getSchedule('sch-1' as Parameters<typeof dataLayer.getSchedule>[0])

          expect(Option.isSome(schedule)).toBe(true)
          if (Option.isSome(schedule)) {
            expect(schedule.value.name).toBe('My Protocol')
            expect(schedule.value.phases.length).toBe(2)
          }
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('returns none for non-existent schedule', () =>
        Effect.gen(function* () {
          const dataLayer = yield* TuiDataLayer
          const schedule = yield* dataLayer.getSchedule('non-existent' as Parameters<typeof dataLayer.getSchedule>[0])

          expect(Option.isNone(schedule)).toBe(true)
        }),
      )
    })
  })

  describe('data format rendering', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('weight log has expected fields for TUI rendering', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-1', new Date('2024-01-15T10:00:00Z'), 185.5, 'Morning measurement')

          const dataLayer = yield* TuiDataLayer
          const logs = yield* dataLayer.listWeightLogs()
          const log = logs[0]

          // Verify all fields needed for TUI rendering are present
          expect(log?.id).toBeDefined()
          expect(log?.datetime).toBeDefined()
          expect(log?.weight).toBe(185.5)
          expect(log?.notes).toBe('Morning measurement')
          expect(log?.createdAt).toBeDefined()
          expect(log?.updatedAt).toBeDefined()
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('injection log has expected fields for TUI rendering', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog(
            'inj-1',
            new Date('2024-01-15T10:00:00Z'),
            'Semaglutide',
            '0.5mg',
            'Left abdomen',
            'Empower',
          )

          const dataLayer = yield* TuiDataLayer
          const logs = yield* dataLayer.listInjectionLogs()
          const log = logs[0]

          // Verify all fields needed for TUI rendering are present
          expect(log?.id).toBeDefined()
          expect(log?.datetime).toBeDefined()
          expect(log?.drug).toBe('Semaglutide')
          expect(log?.dosage).toBe('0.5mg')
          expect(log?.injectionSite).toBe('Left abdomen')
          expect(log?.source).toBe('Empower')
          expect(log?.createdAt).toBeDefined()
          expect(log?.updatedAt).toBeDefined()
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('inventory item has expected fields for TUI rendering', () =>
        Effect.gen(function* () {
          yield* insertInventory('inv-1', 'Semaglutide', 'Empower', 'vial', '10mg', 'opened')

          const dataLayer = yield* TuiDataLayer
          const items = yield* dataLayer.listInventory()
          const item = items[0]

          // Verify all fields needed for TUI rendering are present
          expect(item?.id).toBeDefined()
          expect(item?.drug).toBe('Semaglutide')
          expect(item?.source).toBe('Empower')
          expect(item?.form).toBe('vial')
          expect(item?.totalAmount).toBe('10mg')
          expect(item?.status).toBe('opened')
          expect(item?.createdAt).toBeDefined()
          expect(item?.updatedAt).toBeDefined()
        }),
      )
    })
  })
})
