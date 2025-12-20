import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-node'
import { describe, expect, it } from '@effect/vitest'
import { DataExport, ExportedSettings, Notes, Weight, WeightLog, WeightLogId } from '@subq/shared'
import { DateTime, Effect, Layer } from 'effect'
import { DataExportService, DataExportServiceLive } from '../src/data-export/data-export-service.js'

// ============================================
// In-memory SQLite test layer
// ============================================

const SqliteTestLayer = SqliteClient.layer({ filename: ':memory:' })

// Create all tables for testing
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
      updated_at TEXT NOT NULL
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
      updated_at TEXT NOT NULL
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
      updated_at TEXT NOT NULL
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
      updated_at TEXT NOT NULL
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
      updated_at TEXT NOT NULL
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS user_goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      goal_weight REAL NOT NULL,
      starting_weight REAL NOT NULL,
      starting_date TEXT NOT NULL,
      target_date TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      weight_unit TEXT NOT NULL DEFAULT 'lbs',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `
})

// Clear all tables
const clearTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`DELETE FROM weight_logs`
  yield* sql`DELETE FROM injection_logs`
  yield* sql`DELETE FROM glp1_inventory`
  yield* sql`DELETE FROM schedule_phases`
  yield* sql`DELETE FROM injection_schedules`
  yield* sql`DELETE FROM user_goals`
  yield* sql`DELETE FROM user_settings`
})

// Insert helpers
const insertWeightLog = (id: string, datetime: Date, weight: number, userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO weight_logs (id, datetime, weight, user_id, created_at, updated_at)
      VALUES (${id}, ${datetime.toISOString()}, ${weight}, ${userId}, ${now}, ${now})
    `
  })

const insertSettings = (id: string, userId: string, weightUnit: 'lbs' | 'kg') =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO user_settings (id, user_id, weight_unit, created_at, updated_at)
      VALUES (${id}, ${userId}, ${weightUnit}, ${now}, ${now})
    `
  })

// Combined test layer
const TestLayer = DataExportServiceLive.pipe(Layer.provideMerge(SqliteTestLayer))

// ============================================
// Tests
// ============================================

describe('DataExportService', () => {
  describe('exportData', () => {
    it.effect('exports empty data when user has no records', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const service = yield* DataExportService
        const result = yield* service.exportData('user-123')

        expect(result.version).toBe('1.0.0')
        expect(result.data.weightLogs).toHaveLength(0)
        expect(result.data.injectionLogs).toHaveLength(0)
        expect(result.data.inventory).toHaveLength(0)
        expect(result.data.schedules).toHaveLength(0)
        expect(result.data.goals).toHaveLength(0)
        expect(result.data.settings).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('exports weight logs for user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        // Insert data for user-123
        yield* insertWeightLog('wl-1', new Date('2024-01-01'), 200, 'user-123')
        yield* insertWeightLog('wl-2', new Date('2024-01-02'), 199, 'user-123')
        // Insert data for different user (should not be exported)
        yield* insertWeightLog('wl-3', new Date('2024-01-03'), 180, 'user-456')

        const service = yield* DataExportService
        const result = yield* service.exportData('user-123')

        expect(result.data.weightLogs).toHaveLength(2)
        expect(result.data.weightLogs.map((w) => w.id)).toContain('wl-1')
        expect(result.data.weightLogs.map((w) => w.id)).toContain('wl-2')
        expect(result.data.weightLogs.map((w) => w.id)).not.toContain('wl-3')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('exports user settings', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertSettings('s-1', 'user-123', 'kg')

        const service = yield* DataExportService
        const result = yield* service.exportData('user-123')

        expect(result.data.settings).not.toBeNull()
        expect(result.data.settings?.weightUnit).toBe('kg')
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('importData', () => {
    it.effect('imports data and clears existing', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        // Insert existing data that should be deleted
        yield* insertWeightLog('existing-1', new Date('2024-01-01'), 200, 'user-123')
        yield* insertSettings('s-existing', 'user-123', 'lbs')

        const service = yield* DataExportService

        // Create import data
        const importData = new DataExport({
          version: '1.0.0',
          exportedAt: DateTime.unsafeNow(),
          data: {
            weightLogs: [
              new WeightLog({
                id: WeightLogId.make('imported-1'),
                datetime: DateTime.unsafeMake('2024-02-01T00:00:00Z'),
                weight: Weight.make(190),
                notes: Notes.make('imported log'),
                createdAt: DateTime.unsafeNow(),
                updatedAt: DateTime.unsafeNow(),
              }),
            ],
            injectionLogs: [],
            inventory: [],
            schedules: [],
            goals: [],
            settings: new ExportedSettings({ weightUnit: 'kg' }),
          },
        })

        const result = yield* service.importData('user-123', importData)

        expect(result.weightLogs).toBe(1)
        expect(result.settingsUpdated).toBe(true)

        // Verify old data is gone and new data is present
        const exported = yield* service.exportData('user-123')
        expect(exported.data.weightLogs).toHaveLength(1)
        expect(exported.data.weightLogs[0].id).toBe('imported-1')
        expect(exported.data.settings?.weightUnit).toBe('kg')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('preserves other user data during import', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        // Insert data for different user
        yield* insertWeightLog('other-user-1', new Date('2024-01-01'), 180, 'user-456')

        const service = yield* DataExportService

        // Import data for user-123
        const importData = new DataExport({
          version: '1.0.0',
          exportedAt: DateTime.unsafeNow(),
          data: {
            weightLogs: [
              new WeightLog({
                id: WeightLogId.make('user123-log'),
                datetime: DateTime.unsafeMake('2024-02-01T00:00:00Z'),
                weight: Weight.make(190),
                notes: null,
                createdAt: DateTime.unsafeNow(),
                updatedAt: DateTime.unsafeNow(),
              }),
            ],
            injectionLogs: [],
            inventory: [],
            schedules: [],
            goals: [],
            settings: null,
          },
        })

        yield* service.importData('user-123', importData)

        // Verify other user's data is preserved
        const otherUserExport = yield* service.exportData('user-456')
        expect(otherUserExport.data.weightLogs).toHaveLength(1)
        expect(otherUserExport.data.weightLogs[0].id).toBe('other-user-1')
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
