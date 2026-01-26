/**
 * Unit tests for /sync/pull endpoint.
 * Tests change retrieval, pagination, soft-deleted rows, and auth validation.
 */
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import {
  CliAuthContext,
  InvalidTokenError,
  type PullRequest,
  type PullResponse,
  type SyncChange,
  UserId,
} from '@subq/shared'
import { Effect, Layer, Number as Num, Option, Order, Schema } from 'effect'
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

const createCliSession = (userId: string, token: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = Date.now()
    const sessionId = randomUUID()
    yield* sql`
      INSERT INTO session (id, token, user_id, type, device_name, created_at, updated_at, expires_at)
      VALUES (${sessionId}, ${token}, ${userId}, 'cli', 'test-device', ${now}, ${now}, ${null})
    `
  })

const createWeightLog = (id: string, userId: string, updatedAt: string, deletedAt: string | null = null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO weight_logs (id, datetime, weight, user_id, created_at, updated_at, deleted_at)
      VALUES (${id}, ${now}, 150.0, ${userId}, ${now}, ${updatedAt}, ${deletedAt})
    `
  })

const createInjectionLog = (id: string, userId: string, updatedAt: string, deletedAt: string | null = null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    yield* sql`
      INSERT INTO injection_logs (id, datetime, drug, dosage, user_id, created_at, updated_at, deleted_at)
      VALUES (${id}, ${now}, 'Test Drug', '1mg', ${userId}, ${now}, ${updatedAt}, ${deletedAt})
    `
  })

// ============================================
// SyncPull Function (mirrors rpc-handlers.ts logic)
// ============================================

const SyncRowSchema = Schema.Struct({
  id: Schema.String,
  updated_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
})

const decodeSyncRow = Schema.decodeUnknown(SyncRowSchema)

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

const DEFAULT_PULL_LIMIT = 1000

const syncPull = (
  request: PullRequest,
  userId: UserId,
): Effect.Effect<PullResponse, InvalidTokenError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const limit = Option.getOrElse(Option.fromNullable(request.limit), () => DEFAULT_PULL_LIMIT)
    const cursor = request.cursor

    // Query each synced table for changes after cursor
    const queryTable = (table: SyncedTable) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT * FROM ${sql.literal(table)}
          WHERE user_id = ${userId}
            AND updated_at > ${cursor}
          ORDER BY updated_at ASC
        `.pipe(Effect.orDie)

        const changes: Array<SyncChange> = []
        for (const row of rows) {
          const syncRow = yield* decodeSyncRow(row).pipe(Effect.orDie)
          const operation = syncRow.deleted_at !== null ? 'delete' : 'update'
          const payload: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(row)) {
            payload[key] = value
          }
          changes.push({
            table,
            id: syncRow.id,
            operation,
            payload,
            timestamp: new Date(syncRow.updated_at).getTime(),
          })
        }
        return changes
      })

    const allChanges = yield* Effect.all(SYNCED_TABLES.map(queryTable), { concurrency: 'unbounded' })

    const flatChanges: Array<SyncChange> = allChanges.flat()
    const timestampOrder = Order.mapInput(Num.Order, (change: SyncChange) => change.timestamp)
    const sortedChanges = flatChanges.toSorted(timestampOrder)

    const hasMore = sortedChanges.length > limit
    const returnedChanges = hasMore ? sortedChanges.slice(0, limit) : sortedChanges

    const lastChange = returnedChanges[returnedChanges.length - 1]
    const newCursor = lastChange !== undefined ? new Date(lastChange.timestamp).toISOString() : cursor

    return {
      changes: returnedChanges,
      cursor: newCursor,
      hasMore,
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

describe('/sync/pull', () => {
  it.layer(makeTestLayer())((it) => {
    it.effect('returns changes after cursor timestamp', () =>
      Effect.gen(function* () {
        const userId = 'user-1'
        yield* createTestUser(userId, 'test@example.com', 'Test User')

        // Create weight logs at different timestamps
        const oldTimestamp = '2024-01-01T00:00:00.000Z'
        const newTimestamp = '2024-01-02T00:00:00.000Z'

        yield* createWeightLog('log-old', userId, oldTimestamp)
        yield* createWeightLog('log-new', userId, newTimestamp)

        // Pull with cursor after old timestamp
        const result = yield* syncPull({ cursor: oldTimestamp }, UserId.make(userId))

        // Should only return the newer log
        expect(result.changes.length).toBe(1)
        expect(result.changes[0].id).toBe('log-new')
        expect(result.hasMore).toBe(false)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('respects limit parameter', () =>
      Effect.gen(function* () {
        const userId = 'user-2'
        yield* createTestUser(userId, 'test2@example.com', 'Test User 2')

        // Create multiple weight logs
        const baseTime = new Date('2024-01-01T00:00:00.000Z')
        for (let i = 0; i < 5; i++) {
          const timestamp = new Date(baseTime.getTime() + i * 1000).toISOString()
          yield* createWeightLog(`log-${i}`, userId, timestamp)
        }

        // Pull with limit of 3
        const cursor = '1970-01-01T00:00:00.000Z'
        const result = yield* syncPull({ cursor, limit: 3 }, UserId.make(userId))

        // Should return exactly 3 changes
        expect(result.changes.length).toBe(3)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('hasMore=true when more changes exist', () =>
      Effect.gen(function* () {
        const userId = 'user-3'
        yield* createTestUser(userId, 'test3@example.com', 'Test User 3')

        // Create 5 weight logs
        const baseTime = new Date('2024-01-01T00:00:00.000Z')
        for (let i = 0; i < 5; i++) {
          const timestamp = new Date(baseTime.getTime() + i * 1000).toISOString()
          yield* createWeightLog(`log-${i}`, userId, timestamp)
        }

        // Pull with limit of 3 (should have more)
        const cursor = '1970-01-01T00:00:00.000Z'
        const result = yield* syncPull({ cursor, limit: 3 }, UserId.make(userId))

        expect(result.hasMore).toBe(true)
        expect(result.changes.length).toBe(3)

        // Pull remaining with new cursor
        const result2 = yield* syncPull({ cursor: result.cursor, limit: 3 }, UserId.make(userId))
        expect(result2.hasMore).toBe(false)
        expect(result2.changes.length).toBe(2) // Remaining 2 changes
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('includes soft-deleted rows in response', () =>
      Effect.gen(function* () {
        const userId = 'user-4'
        yield* createTestUser(userId, 'test4@example.com', 'Test User 4')

        // Create a soft-deleted weight log
        const timestamp = '2024-01-02T00:00:00.000Z'
        const deletedAt = '2024-01-02T00:00:00.000Z'
        yield* createWeightLog('log-deleted', userId, timestamp, deletedAt)

        // Pull should include the soft-deleted row
        const cursor = '2024-01-01T00:00:00.000Z'
        const result = yield* syncPull({ cursor }, UserId.make(userId))

        expect(result.changes.length).toBe(1)
        expect(result.changes[0].id).toBe('log-deleted')
        expect(result.changes[0].operation).toBe('delete')
        // Payload should include deleted_at
        expect(result.changes[0].payload['deleted_at']).toBe(deletedAt)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('returns empty array for future cursor', () =>
      Effect.gen(function* () {
        const userId = 'user-5'
        yield* createTestUser(userId, 'test5@example.com', 'Test User 5')

        // Create weight log in the past
        const timestamp = '2024-01-01T00:00:00.000Z'
        yield* createWeightLog('log-1', userId, timestamp)

        // Pull with cursor in the future
        const futureCursor = '2099-01-01T00:00:00.000Z'
        const result = yield* syncPull({ cursor: futureCursor }, UserId.make(userId))

        // Should return empty changes
        expect(result.changes.length).toBe(0)
        expect(result.hasMore).toBe(false)
        expect(result.cursor).toBe(futureCursor) // Cursor stays the same
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('returns changes from multiple tables ordered by timestamp', () =>
      Effect.gen(function* () {
        const userId = 'user-6'
        yield* createTestUser(userId, 'test6@example.com', 'Test User 6')

        // Create changes across different tables with interleaved timestamps
        yield* createWeightLog('weight-1', userId, '2024-01-01T00:00:01.000Z')
        yield* createInjectionLog('injection-1', userId, '2024-01-01T00:00:02.000Z')
        yield* createWeightLog('weight-2', userId, '2024-01-01T00:00:03.000Z')

        const cursor = '2024-01-01T00:00:00.000Z'
        const result = yield* syncPull({ cursor }, UserId.make(userId))

        // Should return all 3 changes in timestamp order
        expect(result.changes.length).toBe(3)
        expect(result.changes[0].id).toBe('weight-1')
        expect(result.changes[0].table).toBe('weight_logs')
        expect(result.changes[1].id).toBe('injection-1')
        expect(result.changes[1].table).toBe('injection_logs')
        expect(result.changes[2].id).toBe('weight-2')
        expect(result.changes[2].table).toBe('weight_logs')
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('only returns changes for the authenticated user', () =>
      Effect.gen(function* () {
        // Create two users
        yield* createTestUser('user-a', 'usera@example.com', 'User A')
        yield* createTestUser('user-b', 'userb@example.com', 'User B')

        // Create weight logs for both users
        const timestamp = '2024-01-01T00:00:01.000Z'
        yield* createWeightLog('log-a', 'user-a', timestamp)
        yield* createWeightLog('log-b', 'user-b', timestamp)

        // Pull as user-a should only return user-a's data
        const cursor = '2024-01-01T00:00:00.000Z'
        const result = yield* syncPull({ cursor }, UserId.make('user-a'))

        expect(result.changes.length).toBe(1)
        expect(result.changes[0].id).toBe('log-a')
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('cursor is updated to max updated_at of returned rows', () =>
      Effect.gen(function* () {
        const userId = 'user-7'
        yield* createTestUser(userId, 'test7@example.com', 'Test User 7')

        // Create weight logs
        yield* createWeightLog('log-1', userId, '2024-01-01T00:00:01.000Z')
        yield* createWeightLog('log-2', userId, '2024-01-01T00:00:02.000Z')
        yield* createWeightLog('log-3', userId, '2024-01-01T00:00:03.000Z')

        const cursor = '2024-01-01T00:00:00.000Z'
        const result = yield* syncPull({ cursor, limit: 2 }, UserId.make(userId))

        // Cursor should be the timestamp of the last returned change
        expect(result.cursor).toBe('2024-01-01T00:00:02.000Z')
      }),
    )
  })
})
