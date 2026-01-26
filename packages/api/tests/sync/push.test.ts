/**
 * Unit tests for /sync/push endpoint.
 * Tests change processing, conflict detection, soft deletes, and auth validation.
 */
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import {
  CliAuthContext,
  InvalidTokenError,
  type PushRequest,
  type PushResponse,
  type SyncChange,
  type SyncConflict,
  UserId,
} from '@subq/shared'
import { Clock, Effect, Layer, Option, Schema, TestClock } from 'effect'
import { randomUUID } from 'node:crypto'

// ============================================
// Test Layer Setup
// ============================================

const SqliteTestLayer = SqliteClient.layer({ filename: ':memory:' })

const setupTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  // User table (for auth)
  yield* sql`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `

  // Session table (for CLI tokens)
  yield* sql`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      type TEXT DEFAULT 'web',
      device_name TEXT,
      last_used_at TEXT,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user(id)
    )
  `

  // weight_logs table
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

  // injection_logs table
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

  // glp1_inventory table
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

  // injection_schedules table
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

  // schedule_phases table
  yield* sql`
    CREATE TABLE IF NOT EXISTS schedule_phases (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      duration_days INTEGER,
      dosage TEXT NOT NULL,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `

  // user_goals table
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
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `

  // user_settings table
  yield* sql`
    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      weight_unit TEXT NOT NULL DEFAULT 'lbs',
      reminders_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `
})

const clearTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`DELETE FROM session`
  yield* sql`DELETE FROM user`
  yield* sql`DELETE FROM weight_logs`
  yield* sql`DELETE FROM injection_logs`
  yield* sql`DELETE FROM glp1_inventory`
  yield* sql`DELETE FROM injection_schedules`
  yield* sql`DELETE FROM schedule_phases`
  yield* sql`DELETE FROM user_goals`
  yield* sql`DELETE FROM user_settings`
})

// ============================================
// Test Data Helpers
// ============================================

const createTestUser = (id: string, email: string, name: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = Date.now()
    yield* sql`
      INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES (${id}, ${name}, ${email}, 1, ${now}, ${now})
    `
  })

const createWeightLog = (
  id: string,
  userId: string,
  weight: number,
  updatedAt: string,
  deletedAt: string | null = null,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO weight_logs (id, datetime, weight, user_id, created_at, updated_at, deleted_at)
      VALUES (${id}, ${now}, ${weight}, ${userId}, ${now}, ${updatedAt}, ${deletedAt})
    `
  })

const getWeightLog = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`SELECT * FROM weight_logs WHERE id = ${id}`
    return rows.length > 0 ? Option.some(rows[0]) : Option.none()
  })

// ============================================
// Synced Tables Configuration
// ============================================

const SYNCED_TABLES = [
  'weight_logs',
  'injection_logs',
  'glp1_inventory',
  'injection_schedules',
  'schedule_phases',
  'user_goals',
  'user_settings',
] as const

type SyncedTable = (typeof SYNCED_TABLES)[number]

// Schema for generic sync row (all synced tables have these columns)
const SyncRowSchema = Schema.Struct({
  id: Schema.String,
  updated_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
})

const decodeSyncRow = Schema.decodeUnknown(SyncRowSchema)

// ============================================
// SyncPush Function (mirrors rpc-handlers.ts logic)
// ============================================

const getServerRow = (
  sql: SqlClient.SqlClient,
  table: SyncedTable,
  id: string,
  userId: string,
): Effect.Effect<Option.Option<Record<string, unknown>>, never, never> =>
  sql`
    SELECT * FROM ${sql.literal(table)}
    WHERE id = ${id} AND user_id = ${userId}
  `.pipe(
    Effect.map((rows) => {
      if (rows.length === 0) {
        return Option.none()
      }
      const payload: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(rows[0])) {
        payload[key] = value
      }
      return Option.some(payload)
    }),
    Effect.orDie,
  )

const insertRow = (
  sql: SqlClient.SqlClient,
  table: SyncedTable,
  payload: Record<string, unknown>,
  userId: string,
  nowIso: string,
): Effect.Effect<void, never, never> => {
  const columns: Array<string> = []
  const values: Array<unknown> = []

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'user_id') continue
    columns.push(key)
    values.push(value)
  }

  columns.push('user_id')
  values.push(userId)

  if (!columns.includes('created_at')) {
    columns.push('created_at')
    values.push(nowIso)
  }
  if (!columns.includes('updated_at')) {
    columns.push('updated_at')
    values.push(nowIso)
  } else {
    const idx = columns.indexOf('updated_at')
    values[idx] = nowIso
  }

  const columnsSql = columns.map((c) => `"${c}"`).join(', ')
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')

  return sql
    .unsafe(`INSERT INTO "${table}" (${columnsSql}) VALUES (${placeholders})`, values)
    .pipe(Effect.asVoid, Effect.orDie)
}

const updateRow = (
  sql: SqlClient.SqlClient,
  table: SyncedTable,
  payload: Record<string, unknown>,
  id: string,
  userId: string,
  nowIso: string,
): Effect.Effect<void, never, never> => {
  const setClauses: Array<string> = []
  const values: Array<unknown> = []
  let paramIndex = 1

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'id' || key === 'user_id' || key === 'created_at') continue
    setClauses.push(`"${key}" = $${paramIndex}`)
    values.push(value)
    paramIndex++
  }

  setClauses.push(`"updated_at" = $${paramIndex}`)
  values.push(nowIso)
  paramIndex++

  const idParamIndex = paramIndex
  values.push(id)
  paramIndex++
  const userIdParamIndex = paramIndex
  values.push(userId)

  const setSql = setClauses.join(', ')

  return sql
    .unsafe(`UPDATE "${table}" SET ${setSql} WHERE id = $${idParamIndex} AND user_id = $${userIdParamIndex}`, values)
    .pipe(Effect.asVoid, Effect.orDie)
}

const syncPush = (
  request: PushRequest,
  userId: UserId,
): Effect.Effect<PushResponse, InvalidTokenError, SqlClient.SqlClient | Clock.Clock> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const clock = yield* Clock.Clock

    const accepted: Array<string> = []
    const conflicts: Array<SyncConflict> = []

    const now = yield* clock.currentTimeMillis
    const nowIso = new Date(now).toISOString()

    yield* sql.withTransaction(
      Effect.forEach(
        request.changes,
        (change) =>
          Effect.gen(function* () {
            if (!SYNCED_TABLES.includes(change.table as SyncedTable)) {
              return
            }

            const table = change.table as SyncedTable

            if (change.operation === 'insert') {
              const existingRows = yield* sql`
                SELECT id, updated_at FROM ${sql.literal(table)}
                WHERE id = ${change.id} AND user_id = ${userId}
              `.pipe(Effect.orDie)

              if (existingRows.length > 0) {
                const serverRow = yield* getServerRow(sql, table, change.id, userId)
                if (Option.isSome(serverRow)) {
                  conflicts.push({
                    id: change.id,
                    serverVersion: serverRow.value,
                  })
                }
                return
              }

              yield* insertRow(sql, table, change.payload, userId, nowIso)
              accepted.push(change.id)
            } else if (change.operation === 'update') {
              const serverRows = yield* sql`
                SELECT updated_at FROM ${sql.literal(table)}
                WHERE id = ${change.id} AND user_id = ${userId}
              `.pipe(Effect.orDie)

              if (serverRows.length === 0) {
                yield* insertRow(sql, table, change.payload, userId, nowIso)
                accepted.push(change.id)
                return
              }

              const serverUpdatedAt = yield* decodeSyncRow({ ...serverRows[0], id: change.id, deleted_at: null }).pipe(
                Effect.map((r) => new Date(r.updated_at).getTime()),
                Effect.orDie,
              )

              if (serverUpdatedAt > change.timestamp) {
                const serverRow = yield* getServerRow(sql, table, change.id, userId)
                if (Option.isSome(serverRow)) {
                  conflicts.push({
                    id: change.id,
                    serverVersion: serverRow.value,
                  })
                }
                return
              }

              yield* updateRow(sql, table, change.payload, change.id, userId, nowIso)
              accepted.push(change.id)
            } else if (change.operation === 'delete') {
              const serverRows = yield* sql`
                SELECT updated_at FROM ${sql.literal(table)}
                WHERE id = ${change.id} AND user_id = ${userId}
              `.pipe(Effect.orDie)

              if (serverRows.length === 0) {
                accepted.push(change.id)
                return
              }

              const serverUpdatedAt = yield* decodeSyncRow({ ...serverRows[0], id: change.id, deleted_at: null }).pipe(
                Effect.map((r) => new Date(r.updated_at).getTime()),
                Effect.orDie,
              )

              if (serverUpdatedAt > change.timestamp) {
                const serverRow = yield* getServerRow(sql, table, change.id, userId)
                if (Option.isSome(serverRow)) {
                  conflicts.push({
                    id: change.id,
                    serverVersion: serverRow.value,
                  })
                }
                return
              }

              yield* sql`
                UPDATE ${sql.literal(table)}
                SET deleted_at = ${nowIso}, updated_at = ${nowIso}
                WHERE id = ${change.id} AND user_id = ${userId}
              `.pipe(Effect.orDie)
              accepted.push(change.id)
            }
          }),
        { discard: true },
      ),
    )

    return {
      accepted,
      conflicts,
    }
  })

// ============================================
// Test Layer Factory
// ============================================

const makeTestLayer = () =>
  Layer.effectDiscard(setupTables.pipe(Effect.andThen(clearTables))).pipe(
    Layer.provideMerge(SqliteTestLayer),
    Layer.fresh,
  )

// ============================================
// Tests
// ============================================

describe('/sync/push', () => {
  it.layer(makeTestLayer())((it) => {
    it.effect('insert creates new row, returns in accepted', () =>
      Effect.gen(function* () {
        const userId = 'user-1'
        yield* createTestUser(userId, 'test@example.com', 'Test User')

        const logId = randomUUID()
        const change: SyncChange = {
          table: 'weight_logs',
          id: logId,
          operation: 'insert',
          payload: {
            id: logId,
            datetime: '2024-01-15T10:00:00.000Z',
            weight: 150.5,
            notes: 'Test insert',
          },
          timestamp: Date.now(),
        }

        const result = yield* syncPush({ changes: [change] }, UserId.make(userId))

        expect(result.accepted).toContain(logId)
        expect(result.conflicts.length).toBe(0)

        // Verify row was created
        const row = yield* getWeightLog(logId)
        expect(Option.isSome(row)).toBe(true)
        if (Option.isSome(row)) {
          expect(row.value['weight']).toBe(150.5)
          expect(row.value['user_id']).toBe(userId)
        }
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('update modifies existing row', () =>
      Effect.gen(function* () {
        const userId = 'user-2'
        yield* createTestUser(userId, 'test2@example.com', 'Test User 2')

        const logId = randomUUID()
        const oldTimestamp = '2024-01-01T00:00:00.000Z'
        yield* createWeightLog(logId, userId, 140.0, oldTimestamp)

        const change: SyncChange = {
          table: 'weight_logs',
          id: logId,
          operation: 'update',
          payload: {
            id: logId,
            datetime: '2024-01-15T10:00:00.000Z',
            weight: 145.5,
            notes: 'Updated weight',
          },
          timestamp: new Date('2024-01-02T00:00:00.000Z').getTime(),
        }

        const result = yield* syncPush({ changes: [change] }, UserId.make(userId))

        expect(result.accepted).toContain(logId)
        expect(result.conflicts.length).toBe(0)

        // Verify row was updated
        const row = yield* getWeightLog(logId)
        expect(Option.isSome(row)).toBe(true)
        if (Option.isSome(row)) {
          expect(row.value['weight']).toBe(145.5)
          expect(row.value['notes']).toBe('Updated weight')
        }
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('delete sets deleted_at (soft delete)', () =>
      Effect.gen(function* () {
        const userId = 'user-3'
        yield* createTestUser(userId, 'test3@example.com', 'Test User 3')

        const logId = randomUUID()
        const oldTimestamp = '2024-01-01T00:00:00.000Z'
        yield* createWeightLog(logId, userId, 150.0, oldTimestamp)

        const change: SyncChange = {
          table: 'weight_logs',
          id: logId,
          operation: 'delete',
          payload: {},
          timestamp: new Date('2024-01-02T00:00:00.000Z').getTime(),
        }

        const result = yield* syncPush({ changes: [change] }, UserId.make(userId))

        expect(result.accepted).toContain(logId)
        expect(result.conflicts.length).toBe(0)

        // Verify row still exists but has deleted_at set
        const row = yield* getWeightLog(logId)
        expect(Option.isSome(row)).toBe(true)
        if (Option.isSome(row)) {
          expect(row.value['deleted_at']).not.toBeNull()
        }
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('conflict detected when server row newer', () =>
      Effect.gen(function* () {
        const userId = 'user-4'
        yield* createTestUser(userId, 'test4@example.com', 'Test User 4')

        const logId = randomUUID()
        // Server has newer timestamp
        const serverTimestamp = '2024-01-10T00:00:00.000Z'
        yield* createWeightLog(logId, userId, 160.0, serverTimestamp)

        const change: SyncChange = {
          table: 'weight_logs',
          id: logId,
          operation: 'update',
          payload: {
            id: logId,
            datetime: '2024-01-15T10:00:00.000Z',
            weight: 155.0,
          },
          // Client timestamp is older than server
          timestamp: new Date('2024-01-05T00:00:00.000Z').getTime(),
        }

        const result = yield* syncPush({ changes: [change] }, UserId.make(userId))

        expect(result.accepted.length).toBe(0)
        expect(result.conflicts.length).toBe(1)
        expect(result.conflicts[0].id).toBe(logId)

        // Verify row was NOT updated
        const row = yield* getWeightLog(logId)
        expect(Option.isSome(row)).toBe(true)
        if (Option.isSome(row)) {
          expect(row.value['weight']).toBe(160.0)
        }
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('conflict response includes server version', () =>
      Effect.gen(function* () {
        const userId = 'user-5'
        yield* createTestUser(userId, 'test5@example.com', 'Test User 5')

        const logId = randomUUID()
        const serverTimestamp = '2024-01-10T00:00:00.000Z'
        yield* createWeightLog(logId, userId, 170.0, serverTimestamp)

        const change: SyncChange = {
          table: 'weight_logs',
          id: logId,
          operation: 'update',
          payload: {
            id: logId,
            datetime: '2024-01-15T10:00:00.000Z',
            weight: 165.0,
          },
          timestamp: new Date('2024-01-05T00:00:00.000Z').getTime(),
        }

        const result = yield* syncPush({ changes: [change] }, UserId.make(userId))

        expect(result.conflicts.length).toBe(1)
        const conflict = result.conflicts[0]
        expect(conflict.id).toBe(logId)
        expect(conflict.serverVersion).toBeDefined()
        expect(conflict.serverVersion['weight']).toBe(170.0)
        expect(conflict.serverVersion['user_id']).toBe(userId)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('multiple changes in single request', () =>
      Effect.gen(function* () {
        const userId = 'user-6'
        yield* createTestUser(userId, 'test6@example.com', 'Test User 6')

        const insertId = randomUUID()
        const updateId = randomUUID()
        const deleteId = randomUUID()
        const conflictId = randomUUID()

        // Create existing rows
        const oldTimestamp = '2024-01-01T00:00:00.000Z'
        const newerTimestamp = '2024-01-10T00:00:00.000Z'
        yield* createWeightLog(updateId, userId, 140.0, oldTimestamp)
        yield* createWeightLog(deleteId, userId, 145.0, oldTimestamp)
        yield* createWeightLog(conflictId, userId, 150.0, newerTimestamp)

        const changes: Array<SyncChange> = [
          {
            table: 'weight_logs',
            id: insertId,
            operation: 'insert',
            payload: { id: insertId, datetime: '2024-01-15T10:00:00.000Z', weight: 155.0 },
            timestamp: Date.now(),
          },
          {
            table: 'weight_logs',
            id: updateId,
            operation: 'update',
            payload: { id: updateId, datetime: '2024-01-15T10:00:00.000Z', weight: 142.0 },
            timestamp: new Date('2024-01-05T00:00:00.000Z').getTime(),
          },
          {
            table: 'weight_logs',
            id: deleteId,
            operation: 'delete',
            payload: {},
            timestamp: new Date('2024-01-05T00:00:00.000Z').getTime(),
          },
          {
            table: 'weight_logs',
            id: conflictId,
            operation: 'update',
            payload: { id: conflictId, datetime: '2024-01-15T10:00:00.000Z', weight: 148.0 },
            timestamp: new Date('2024-01-05T00:00:00.000Z').getTime(),
          },
        ]

        const result = yield* syncPush({ changes }, UserId.make(userId))

        // Insert, update, and delete should be accepted
        expect(result.accepted).toContain(insertId)
        expect(result.accepted).toContain(updateId)
        expect(result.accepted).toContain(deleteId)
        expect(result.accepted.length).toBe(3)

        // Conflict row should be in conflicts
        expect(result.conflicts.length).toBe(1)
        expect(result.conflicts[0].id).toBe(conflictId)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('insert fails for existing row (conflict)', () =>
      Effect.gen(function* () {
        const userId = 'user-7'
        yield* createTestUser(userId, 'test7@example.com', 'Test User 7')

        const logId = randomUUID()
        yield* createWeightLog(logId, userId, 175.0, '2024-01-01T00:00:00.000Z')

        const change: SyncChange = {
          table: 'weight_logs',
          id: logId,
          operation: 'insert',
          payload: {
            id: logId,
            datetime: '2024-01-15T10:00:00.000Z',
            weight: 180.0,
          },
          timestamp: Date.now(),
        }

        const result = yield* syncPush({ changes: [change] }, UserId.make(userId))

        expect(result.accepted.length).toBe(0)
        expect(result.conflicts.length).toBe(1)
        expect(result.conflicts[0].id).toBe(logId)
        expect(result.conflicts[0].serverVersion['weight']).toBe(175.0)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('update non-existent row creates it (upsert behavior)', () =>
      Effect.gen(function* () {
        const userId = 'user-8'
        yield* createTestUser(userId, 'test8@example.com', 'Test User 8')

        const logId = randomUUID()

        const change: SyncChange = {
          table: 'weight_logs',
          id: logId,
          operation: 'update',
          payload: {
            id: logId,
            datetime: '2024-01-15T10:00:00.000Z',
            weight: 185.0,
          },
          timestamp: Date.now(),
        }

        const result = yield* syncPush({ changes: [change] }, UserId.make(userId))

        expect(result.accepted).toContain(logId)
        expect(result.conflicts.length).toBe(0)

        // Verify row was created
        const row = yield* getWeightLog(logId)
        expect(Option.isSome(row)).toBe(true)
        if (Option.isSome(row)) {
          expect(row.value['weight']).toBe(185.0)
        }
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('delete non-existent row is accepted', () =>
      Effect.gen(function* () {
        const userId = 'user-9'
        yield* createTestUser(userId, 'test9@example.com', 'Test User 9')

        const logId = randomUUID()

        const change: SyncChange = {
          table: 'weight_logs',
          id: logId,
          operation: 'delete',
          payload: {},
          timestamp: Date.now(),
        }

        const result = yield* syncPush({ changes: [change] }, UserId.make(userId))

        // Should be accepted (idempotent delete)
        expect(result.accepted).toContain(logId)
        expect(result.conflicts.length).toBe(0)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('delete conflict when server row newer', () =>
      Effect.gen(function* () {
        const userId = 'user-10'
        yield* createTestUser(userId, 'test10@example.com', 'Test User 10')

        const logId = randomUUID()
        // Server has newer timestamp
        const serverTimestamp = '2024-01-10T00:00:00.000Z'
        yield* createWeightLog(logId, userId, 190.0, serverTimestamp)

        const change: SyncChange = {
          table: 'weight_logs',
          id: logId,
          operation: 'delete',
          payload: {},
          // Client timestamp is older than server
          timestamp: new Date('2024-01-05T00:00:00.000Z').getTime(),
        }

        const result = yield* syncPush({ changes: [change] }, UserId.make(userId))

        expect(result.accepted.length).toBe(0)
        expect(result.conflicts.length).toBe(1)
        expect(result.conflicts[0].id).toBe(logId)

        // Verify row was NOT deleted
        const row = yield* getWeightLog(logId)
        expect(Option.isSome(row)).toBe(true)
        if (Option.isSome(row)) {
          expect(row.value['deleted_at']).toBeNull()
        }
      }),
    )
  })
})
