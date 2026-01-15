/**
 * Shared test database utilities for integration tests.
 * Uses in-memory SQLite to test real SQL queries.
 */

import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { Effect, Layer } from 'effect'

// ============================================
// SQLite In-Memory Test Layer
// ============================================

export const SqliteTestLayer = SqliteClient.layer({ filename: ':memory:' })

// ============================================
// Table Setup
// ============================================

export const setupTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  // Weight logs
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

  // Injection schedules (must come before injection_logs due to FK)
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

  // Schedule phases
  yield* sql`
    CREATE TABLE IF NOT EXISTS schedule_phases (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL REFERENCES injection_schedules(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL,
      duration_days INTEGER,
      dosage TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `

  // Injection logs
  yield* sql`
    CREATE TABLE IF NOT EXISTS injection_logs (
      id TEXT PRIMARY KEY,
      datetime TEXT NOT NULL,
      drug TEXT NOT NULL,
      source TEXT,
      dosage TEXT NOT NULL,
      injection_site TEXT,
      notes TEXT,
      schedule_id TEXT REFERENCES injection_schedules(id) ON DELETE SET NULL,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `

  // GLP-1 Inventory
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

  // User goals
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

  // User settings
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

// ============================================
// Clear All Tables
// ============================================

export const clearTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  // Order matters due to foreign keys
  yield* sql`DELETE FROM schedule_phases`
  yield* sql`DELETE FROM injection_logs`
  yield* sql`DELETE FROM injection_schedules`
  yield* sql`DELETE FROM weight_logs`
  yield* sql`DELETE FROM glp1_inventory`
  yield* sql`DELETE FROM user_goals`
  yield* sql`DELETE FROM user_settings`
})

// ============================================
// Insert Helpers
// ============================================

export const insertWeightLog = (
  id: string,
  datetime: Date,
  weight: number,
  userId: string,
  notes: string | null = null,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
      VALUES (${id}, ${datetime.toISOString()}, ${weight}, ${notes}, ${userId}, ${now}, ${now})
    `
  })

export const insertInjectionLog = (
  id: string,
  datetime: Date,
  drug: string,
  dosage: string,
  userId: string,
  options: {
    source?: string | null
    injectionSite?: string | null
    notes?: string | null
    scheduleId?: string | null
  } = {},
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)
      VALUES (${id}, ${datetime.toISOString()}, ${drug}, ${options.source ?? null}, ${dosage}, ${options.injectionSite ?? null}, ${options.notes ?? null}, ${options.scheduleId ?? null}, ${userId}, ${now}, ${now})
    `
  })

export const insertInventory = (
  id: string,
  drug: string,
  source: string,
  form: 'vial' | 'pen',
  totalAmount: string,
  status: 'new' | 'opened' | 'finished',
  userId: string,
  beyondUseDate: string | null = null,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO glp1_inventory (id, drug, source, form, total_amount, status, beyond_use_date, user_id, created_at, updated_at)
      VALUES (${id}, ${drug}, ${source}, ${form}, ${totalAmount}, ${status}, ${beyondUseDate}, ${userId}, ${now}, ${now})
    `
  })

export const insertSchedule = (
  id: string,
  name: string,
  drug: string,
  frequency: string,
  startDate: Date,
  userId: string,
  options: {
    source?: string | null
    isActive?: boolean
    notes?: string | null
  } = {},
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)
      VALUES (${id}, ${name}, ${drug}, ${options.source ?? null}, ${frequency}, ${startDate.toISOString()}, ${options.isActive !== false ? 1 : 0}, ${options.notes ?? null}, ${userId}, ${now}, ${now})
    `
  })

export const insertSchedulePhase = (
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

export const insertSettings = (id: string, userId: string, weightUnit: 'lbs' | 'kg') =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO user_settings (id, user_id, weight_unit, created_at, updated_at)
      VALUES (${id}, ${userId}, ${weightUnit}, ${now}, ${now})
    `
  })

// ============================================
// Test Layer Builder
// ============================================

/**
 * Creates a test layer with setup/teardown composed into the layer.
 * Each test gets fresh state via Layer.fresh. Eliminates need to call
 * setupTables and clearTables in every test body.
 *
 * Usage:
 *   const TestLayer = makeInitializedTestLayer(WeightLogRepoLive)
 *   it.layer(TestLayer)("creates entry", () => Effect.gen(function* () {
 *     const repo = yield* WeightLogRepo
 *     // tables already set up and cleared
 *   }))
 */
export const makeInitializedTestLayer = <Out, Err>(repoLayer: Layer.Layer<Out, Err, SqlClient.SqlClient>) =>
  Layer.effectDiscard(setupTables.pipe(Effect.andThen(clearTables))).pipe(
    Layer.provideMerge(repoLayer.pipe(Layer.provideMerge(SqliteTestLayer))),
    Layer.fresh,
  )
