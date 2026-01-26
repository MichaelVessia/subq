/**
 * Unit tests for CLI auth middleware.
 * Tests token validation, type checking, last_used_at updates, and error handling.
 */
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Layer, Option, TestClock } from 'effect'
import { cliAuthMiddleware, extractBearerToken, validateCliToken } from '../../src/middleware/cli-auth.js'

// ============================================
// Test Layer Setup
// ============================================

const SqliteTestLayer = SqliteClient.layer({ filename: ':memory:' })

const setupSessionTable = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
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
      ip_address TEXT,
      user_agent TEXT
    )
  `
})

const clearSessionTable = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`DELETE FROM session`
})

const makeTestLayer = () =>
  Layer.effectDiscard(setupSessionTable.pipe(Effect.andThen(clearSessionTable))).pipe(
    Layer.provideMerge(SqliteTestLayer),
    Layer.fresh,
  )

// ============================================
// Insert Helpers
// ============================================

const insertSession = (
  id: string,
  token: string,
  userId: string,
  type: 'web' | 'cli',
  lastUsedAt: string | null = null,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = Date.now()
    yield* sql`
      INSERT INTO session (id, token, user_id, type, last_used_at, created_at, updated_at)
      VALUES (${id}, ${token}, ${userId}, ${type}, ${lastUsedAt}, ${now}, ${now})
    `
  })

const getSessionLastUsedAt = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ last_used_at: string | null }>`
      SELECT last_used_at FROM session WHERE id = ${id}
    `
    const first = rows[0]
    return first ? first.last_used_at : null
  })

// ============================================
// Tests
// ============================================

describe('extractBearerToken', () => {
  it('extracts token from valid Bearer header', () => {
    const result = extractBearerToken('Bearer my-token-123')
    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrNull(result)).toBe('my-token-123')
  })

  it('returns None for undefined header', () => {
    const result = extractBearerToken(undefined)
    expect(Option.isNone(result)).toBe(true)
  })

  it('returns None for empty header', () => {
    const result = extractBearerToken('')
    expect(Option.isNone(result)).toBe(true)
  })

  it('returns None for non-Bearer header', () => {
    const result = extractBearerToken('Basic credentials')
    expect(Option.isNone(result)).toBe(true)
  })

  it('returns None for Bearer without space', () => {
    const result = extractBearerToken('Bearertoken')
    expect(Option.isNone(result)).toBe(true)
  })
})

describe('validateCliToken', () => {
  it.layer(makeTestLayer())((it) => {
    it.effect('valid CLI token returns user ID', () =>
      Effect.gen(function* () {
        yield* insertSession('session-1', 'cli-token-123', 'user-abc', 'cli')

        const userId = yield* validateCliToken('cli-token-123')

        expect(userId).toBe('user-abc')
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('expired web token rejected (type mismatch)', () =>
      Effect.gen(function* () {
        // Insert a web session, not CLI
        yield* insertSession('session-web', 'web-token-456', 'user-xyz', 'web')

        const result = yield* validateCliToken('web-token-456').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InvalidTokenError')
          expect(result.left.message).toBe('Invalid CLI token')
        }
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('invalid token returns InvalidTokenError', () =>
      Effect.gen(function* () {
        const result = yield* validateCliToken('non-existent-token').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InvalidTokenError')
          expect(result.left.message).toBe('Invalid CLI token')
        }
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('last_used_at updated after validation', () =>
      Effect.gen(function* () {
        yield* insertSession('session-2', 'cli-token-789', 'user-def', 'cli', null)

        // Verify last_used_at is initially null
        const beforeUpdate = yield* getSessionLastUsedAt('session-2')
        expect(beforeUpdate).toBeNull()

        // Validate token (which should update last_used_at)
        yield* validateCliToken('cli-token-789')

        // Verify last_used_at is now set
        const afterUpdate = yield* getSessionLastUsedAt('session-2')
        expect(afterUpdate).not.toBeNull()
        // Verify it's a valid ISO timestamp
        expect(new Date(afterUpdate!).toISOString()).toBe(afterUpdate)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('uses Clock service for timestamps', () =>
      Effect.gen(function* () {
        yield* insertSession('session-3', 'cli-token-clock', 'user-clock', 'cli', null)

        // Set a specific time via TestClock
        yield* TestClock.setTime(new Date('2025-06-15T12:00:00.000Z').getTime())

        // Validate token
        yield* validateCliToken('cli-token-clock')

        // Verify last_used_at matches the TestClock time
        const lastUsed = yield* getSessionLastUsedAt('session-3')
        expect(lastUsed).toBe('2025-06-15T12:00:00.000Z')
      }),
    )
  })
})

describe('cliAuthMiddleware', () => {
  it.layer(makeTestLayer())((it) => {
    it.effect('returns user ID for valid Bearer token', () =>
      Effect.gen(function* () {
        yield* insertSession('session-mw-1', 'mw-token-123', 'user-mw', 'cli')

        const userId = yield* cliAuthMiddleware('Bearer mw-token-123')

        expect(userId).toBe('user-mw')
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('returns InvalidTokenError for missing Authorization header', () =>
      Effect.gen(function* () {
        const result = yield* cliAuthMiddleware(undefined).pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InvalidTokenError')
          expect(result.left.message).toBe('Missing or invalid Authorization header')
        }
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('returns InvalidTokenError for non-Bearer Authorization header', () =>
      Effect.gen(function* () {
        const result = yield* cliAuthMiddleware('Basic credentials').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InvalidTokenError')
          expect(result.left.message).toBe('Missing or invalid Authorization header')
        }
      }),
    )
  })
})
