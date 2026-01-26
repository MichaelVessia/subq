/**
 * Unit tests for CLI token revocation endpoints.
 * Tests single and bulk revocation of CLI sessions.
 */
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import {
  RevokeAllCliSessionsResponse,
  RevokeCliSessionResponse,
  SessionNotFoundError,
  SettingsDatabaseError,
} from '@subq/shared'
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

const countSessions = (userId: string, type: 'web' | 'cli') =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const result = yield* sql`
      SELECT COUNT(*) as count FROM session
      WHERE userId = ${userId} AND type = ${type}
    `
    return Number(result[0]?.count ?? 0)
  })

const sessionExists = (sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const result = yield* sql`
      SELECT COUNT(*) as count FROM session WHERE id = ${sessionId}
    `
    return Number(result[0]?.count ?? 0) > 0
  })

// ============================================
// Revoke Single Session Function (mirrors rpc-handlers.ts logic)
// ============================================

const revokeCliSession = (userId: string, sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // Check if the session exists and belongs to this user
    const existingSession = yield* sql`
      SELECT id FROM session
      WHERE id = ${sessionId} AND userId = ${userId} AND type = 'cli'
    `.pipe(Effect.mapError((cause) => SettingsDatabaseError.make({ operation: 'query', cause })))

    if (existingSession.length === 0) {
      return yield* Effect.fail(SessionNotFoundError.make({ sessionId }))
    }

    // Delete the session
    yield* sql`
      DELETE FROM session
      WHERE id = ${sessionId} AND userId = ${userId} AND type = 'cli'
    `.pipe(Effect.mapError((cause) => SettingsDatabaseError.make({ operation: 'update', cause })))

    return new RevokeCliSessionResponse({ success: true })
  })

// ============================================
// Revoke All Sessions Function (mirrors rpc-handlers.ts logic)
// ============================================

const revokeAllCliSessions = (userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // Count how many CLI sessions will be deleted
    const countResult = yield* sql`
      SELECT COUNT(*) as count FROM session
      WHERE userId = ${userId} AND type = 'cli'
    `.pipe(Effect.mapError((cause) => SettingsDatabaseError.make({ operation: 'query', cause })))

    const revokedCount = Number(countResult[0]?.count ?? 0)

    // Delete all CLI sessions for this user
    yield* sql`
      DELETE FROM session
      WHERE userId = ${userId} AND type = 'cli'
    `.pipe(Effect.mapError((cause) => SettingsDatabaseError.make({ operation: 'update', cause })))

    return new RevokeAllCliSessionsResponse({ revokedCount })
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
// Tests - Single Token Revocation
// ============================================

describe('Revoke Single CLI Token', () => {
  it.layer(makeTestLayer())((it) => {
    it.effect('revoke single token removes from DB', () =>
      Effect.gen(function* () {
        // Create test user with CLI session
        yield* createTestUser('user-1', 'test@example.com', 'Test User')
        yield* createSession('cli-session-1', 'user-1', 'cli', 'MacBook Pro', '2026-01-20T10:00:00Z')

        // Verify session exists
        const existsBefore = yield* sessionExists('cli-session-1')
        expect(existsBefore).toBe(true)

        // Revoke the session
        const result = yield* revokeCliSession('user-1', 'cli-session-1')

        expect(result.success).toBe(true)

        // Verify session is removed
        const existsAfter = yield* sessionExists('cli-session-1')
        expect(existsAfter).toBe(false)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('revoke non-existent token returns error', () =>
      Effect.gen(function* () {
        // Create test user without any sessions
        yield* createTestUser('user-2', 'test2@example.com', 'Test User 2')

        // Try to revoke a non-existent session
        const result = yield* revokeCliSession('user-2', 'non-existent-session').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('SessionNotFoundError')
          const error = result.left as SessionNotFoundError
          expect(error.sessionId).toBe('non-existent-session')
        }
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect("can't revoke another user's token", () =>
      Effect.gen(function* () {
        // Create two test users
        yield* createTestUser('user-3', 'test3@example.com', 'Test User 3')
        yield* createTestUser('user-4', 'test4@example.com', 'Test User 4')

        // Create CLI session for user-3
        yield* createSession('cli-session-user3', 'user-3', 'cli', 'Device', null)

        // User-4 tries to revoke user-3's session
        const result = yield* revokeCliSession('user-4', 'cli-session-user3').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('SessionNotFoundError')
        }

        // Verify session still exists (wasn't deleted)
        const stillExists = yield* sessionExists('cli-session-user3')
        expect(stillExists).toBe(true)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect("can't revoke a web session using CLI revoke endpoint", () =>
      Effect.gen(function* () {
        // Create test user with web session
        yield* createTestUser('user-5', 'test5@example.com', 'Test User 5')
        yield* createSession('web-session-1', 'user-5', 'web', null, null)

        // Try to revoke the web session using CLI revoke
        const result = yield* revokeCliSession('user-5', 'web-session-1').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('SessionNotFoundError')
        }

        // Web session should still exist
        const stillExists = yield* sessionExists('web-session-1')
        expect(stillExists).toBe(true)
      }),
    )
  })
})

// ============================================
// Tests - Bulk Token Revocation
// ============================================

describe('Revoke All CLI Tokens', () => {
  it.layer(makeTestLayer())((it) => {
    it.effect('revoke all removes all CLI tokens', () =>
      Effect.gen(function* () {
        // Create test user with multiple CLI sessions
        yield* createTestUser('user-6', 'test6@example.com', 'Test User 6')
        yield* createSession('cli-session-a', 'user-6', 'cli', 'MacBook', null)
        yield* createSession('cli-session-b', 'user-6', 'cli', 'Linux', null)
        yield* createSession('cli-session-c', 'user-6', 'cli', 'Windows', null)

        // Verify CLI sessions exist
        const countBefore = yield* countSessions('user-6', 'cli')
        expect(countBefore).toBe(3)

        // Revoke all
        const result = yield* revokeAllCliSessions('user-6')

        expect(result.revokedCount).toBe(3)

        // Verify all CLI sessions are removed
        const countAfter = yield* countSessions('user-6', 'cli')
        expect(countAfter).toBe(0)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect("revoke all doesn't affect web sessions", () =>
      Effect.gen(function* () {
        // Create test user with both CLI and web sessions
        yield* createTestUser('user-7', 'test7@example.com', 'Test User 7')
        yield* createSession('cli-session-d', 'user-7', 'cli', 'CLI Device 1', null)
        yield* createSession('cli-session-e', 'user-7', 'cli', 'CLI Device 2', null)
        yield* createSession('web-session-a', 'user-7', 'web', null, null)
        yield* createSession('web-session-b', 'user-7', 'web', null, null)

        // Verify counts before
        const cliCountBefore = yield* countSessions('user-7', 'cli')
        const webCountBefore = yield* countSessions('user-7', 'web')
        expect(cliCountBefore).toBe(2)
        expect(webCountBefore).toBe(2)

        // Revoke all CLI sessions
        const result = yield* revokeAllCliSessions('user-7')

        expect(result.revokedCount).toBe(2)

        // Verify CLI sessions are removed but web sessions remain
        const cliCountAfter = yield* countSessions('user-7', 'cli')
        const webCountAfter = yield* countSessions('user-7', 'web')
        expect(cliCountAfter).toBe(0)
        expect(webCountAfter).toBe(2)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('revoke all with no CLI sessions returns zero count', () =>
      Effect.gen(function* () {
        // Create test user with only web sessions
        yield* createTestUser('user-8', 'test8@example.com', 'Test User 8')
        yield* createSession('web-session-c', 'user-8', 'web', null, null)

        // Revoke all CLI sessions (there are none)
        const result = yield* revokeAllCliSessions('user-8')

        expect(result.revokedCount).toBe(0)

        // Web session should still exist
        const webCount = yield* countSessions('user-8', 'web')
        expect(webCount).toBe(1)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect("revoke all doesn't affect other users' sessions", () =>
      Effect.gen(function* () {
        // Create two test users with CLI sessions
        yield* createTestUser('user-9', 'test9@example.com', 'Test User 9')
        yield* createTestUser('user-10', 'test10@example.com', 'Test User 10')
        yield* createSession('cli-session-f', 'user-9', 'cli', 'User 9 Device', null)
        yield* createSession('cli-session-g', 'user-10', 'cli', 'User 10 Device', null)

        // User-9 revokes all their CLI sessions
        const result = yield* revokeAllCliSessions('user-9')

        expect(result.revokedCount).toBe(1)

        // User-9's session should be gone
        const user9Count = yield* countSessions('user-9', 'cli')
        expect(user9Count).toBe(0)

        // User-10's session should still exist
        const user10Count = yield* countSessions('user-10', 'cli')
        expect(user10Count).toBe(1)
      }),
    )
  })
})
