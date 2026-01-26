/**
 * Unit tests for CLI session list endpoint.
 * Tests listing and filtering of CLI sessions.
 */
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { CliSession, CliSessionList, SettingsDatabaseError } from '@subq/shared'
import { Effect, Layer, Schema } from 'effect'

// ============================================
// Test Layer Setup
// ============================================

const SqliteTestLayer = SqliteClient.layer({ filename: ':memory:' })

const setupTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  // User table
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

  // Session table (matching prod schema)
  yield* sql`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      userId TEXT NOT NULL,
      type TEXT DEFAULT 'web',
      device_name TEXT,
      last_used_at TEXT,
      expiresAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES user(id)
    )
  `
})

const clearTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`DELETE FROM session`
  yield* sql`DELETE FROM user`
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

const createSession = (
  id: string,
  userId: string,
  type: 'web' | 'cli',
  deviceName: string | null,
  lastUsedAt: string | null,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = Date.now()
    yield* sql`
      INSERT INTO session (id, token, userId, type, device_name, last_used_at, createdAt, updatedAt)
      VALUES (${id}, ${'token-' + id}, ${userId}, ${type}, ${deviceName}, ${lastUsedAt}, ${now}, ${now})
    `
  })

// ============================================
// List CLI Sessions Function (mirrors rpc-handlers.ts logic)
// ============================================

const SessionRow = Schema.Struct({
  id: Schema.String,
  device_name: Schema.NullOr(Schema.String),
  last_used_at: Schema.NullOr(Schema.String),
  created_at: Schema.Number,
})

const decodeSessionRow = Schema.decodeUnknown(SessionRow)

const listCliSessions = (userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const rows = yield* sql`
      SELECT id, device_name, last_used_at, createdAt as created_at
      FROM session
      WHERE userId = ${userId} AND type = 'cli'
      ORDER BY createdAt DESC
    `.pipe(Effect.mapError((cause) => SettingsDatabaseError.make({ operation: 'query', cause })))

    const sessions = yield* Effect.forEach(rows, (row) =>
      decodeSessionRow(row).pipe(
        Effect.map(
          (r) =>
            new CliSession({
              id: r.id,
              deviceName: r.device_name,
              lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
              createdAt: new Date(r.created_at),
            }),
        ),
        Effect.mapError((cause) => SettingsDatabaseError.make({ operation: 'query', cause })),
      ),
    )

    return new CliSessionList({ sessions })
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

describe('CLI Sessions List', () => {
  it.layer(makeTestLayer())((it) => {
    it.effect('returns CLI sessions only', () =>
      Effect.gen(function* () {
        // Create test user
        yield* createTestUser('user-1', 'test@example.com', 'Test User')

        // Create CLI sessions
        yield* createSession('cli-session-1', 'user-1', 'cli', 'MacBook Pro', '2026-01-20T10:00:00Z')
        yield* createSession('cli-session-2', 'user-1', 'cli', 'Linux Server', '2026-01-21T14:30:00Z')

        // Create web sessions (should be excluded)
        yield* createSession('web-session-1', 'user-1', 'web', null, null)
        yield* createSession('web-session-2', 'user-1', 'web', null, null)

        const result = yield* listCliSessions('user-1')

        expect(result.sessions.length).toBe(2)
        expect(result.sessions.every((s) => s.id.startsWith('cli-'))).toBe(true)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('excludes web sessions', () =>
      Effect.gen(function* () {
        // Create test user
        yield* createTestUser('user-2', 'test2@example.com', 'Test User 2')

        // Create only web sessions
        yield* createSession('web-session-3', 'user-2', 'web', null, null)
        yield* createSession('web-session-4', 'user-2', 'web', null, null)

        const result = yield* listCliSessions('user-2')

        expect(result.sessions.length).toBe(0)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('returns empty list when no CLI tokens', () =>
      Effect.gen(function* () {
        // Create test user with no sessions
        yield* createTestUser('user-3', 'test3@example.com', 'Test User 3')

        const result = yield* listCliSessions('user-3')

        expect(result.sessions.length).toBe(0)
        expect(result.sessions).toEqual([])
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('returns correct device_name and last_used_at', () =>
      Effect.gen(function* () {
        // Create test user
        yield* createTestUser('user-4', 'test4@example.com', 'Test User 4')

        // Create CLI session with specific device name and last used date
        yield* createSession('cli-session-3', 'user-4', 'cli', 'My Laptop', '2026-01-25T08:30:00Z')

        const result = yield* listCliSessions('user-4')

        expect(result.sessions.length).toBe(1)
        expect(result.sessions[0].deviceName).toBe('My Laptop')
        expect(result.sessions[0].lastUsedAt).toEqual(new Date('2026-01-25T08:30:00Z'))
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('returns null for lastUsedAt when not set', () =>
      Effect.gen(function* () {
        // Create test user
        yield* createTestUser('user-5', 'test5@example.com', 'Test User 5')

        // Create CLI session without last_used_at
        yield* createSession('cli-session-4', 'user-5', 'cli', 'New Device', null)

        const result = yield* listCliSessions('user-5')

        expect(result.sessions.length).toBe(1)
        expect(result.sessions[0].deviceName).toBe('New Device')
        expect(result.sessions[0].lastUsedAt).toBeNull()
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('only returns sessions for the specified user', () =>
      Effect.gen(function* () {
        // Create two test users
        yield* createTestUser('user-6', 'test6@example.com', 'Test User 6')
        yield* createTestUser('user-7', 'test7@example.com', 'Test User 7')

        // Create CLI sessions for both users
        yield* createSession('cli-session-5', 'user-6', 'cli', 'User 6 Device', null)
        yield* createSession('cli-session-6', 'user-7', 'cli', 'User 7 Device', null)

        // List sessions for user-6 only
        const result = yield* listCliSessions('user-6')

        expect(result.sessions.length).toBe(1)
        expect(result.sessions[0].deviceName).toBe('User 6 Device')
      }),
    )
  })
})
