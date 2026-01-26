/**
 * Unit tests for /sync/authenticate endpoint.
 * Tests credential validation and CLI session creation.
 */
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { LoginFailedError } from '@subq/shared'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { Effect, Layer, Schema } from 'effect'
import { randomUUID } from 'node:crypto'

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

  // Account table (for credentials)
  yield* sql`
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      password TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user(id)
    )
  `

  // Session table
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
})

const clearTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`DELETE FROM session`
  yield* sql`DELETE FROM account`
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

const createCredentialAccount = (userId: string, password: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = Date.now()
    const hashedPassword = yield* Effect.promise(() => hashPassword(password))
    yield* sql`
      INSERT INTO account (id, account_id, provider_id, user_id, password, createdAt, updatedAt)
      VALUES (${'account-' + userId}, ${userId}, 'credential', ${userId}, ${hashedPassword}, ${now}, ${now})
    `
  })

const getSession = (token: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{
      id: string
      user_id: string
      type: string
      device_name: string | null
      expires_at: number | null
    }>`
      SELECT id, user_id, type, device_name, expires_at FROM session WHERE token = ${token}
    `
    return rows[0]
  })

// ============================================
// Authenticate Function (mirrors rpc-handlers.ts logic)
// ============================================

const UserRow = Schema.Struct({ id: Schema.String })
const AccountRow = Schema.Struct({ user_id: Schema.String, password: Schema.String })
const decodeUserRow = Schema.decodeUnknown(UserRow)
const decodeAccountRow = Schema.decodeUnknown(AccountRow)

interface AuthRequest {
  email: string
  password: string
  deviceName: string
}

const authenticate = (request: AuthRequest) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // Look up user by email
    const userRows = yield* sql`
      SELECT id FROM user WHERE email = ${request.email}
    `.pipe(
      Effect.mapError(
        () =>
          new LoginFailedError({
            reason: 'network_error',
            message: 'Database error during authentication',
          }),
      ),
    )

    if (userRows.length === 0) {
      return yield* new LoginFailedError({
        reason: 'invalid_credentials',
        message: 'Invalid email or password',
      })
    }

    const user = yield* decodeUserRow(userRows[0]).pipe(
      Effect.mapError(
        () =>
          new LoginFailedError({
            reason: 'invalid_credentials',
            message: 'Invalid email or password',
          }),
      ),
    )
    const userId = user.id

    // Get account with password hash
    const accountRows = yield* sql`
      SELECT user_id, password FROM account
      WHERE user_id = ${userId} AND provider_id = 'credential'
    `.pipe(
      Effect.mapError(
        () =>
          new LoginFailedError({
            reason: 'network_error',
            message: 'Database error during authentication',
          }),
      ),
    )

    if (accountRows.length === 0) {
      return yield* new LoginFailedError({
        reason: 'invalid_credentials',
        message: 'Invalid email or password',
      })
    }

    const account = yield* decodeAccountRow(accountRows[0]).pipe(
      Effect.mapError(
        () =>
          new LoginFailedError({
            reason: 'invalid_credentials',
            message: 'Invalid email or password',
          }),
      ),
    )

    // Verify password
    const isValid = yield* Effect.promise(() => verifyPassword({ hash: account.password, password: request.password }))

    if (!isValid) {
      return yield* new LoginFailedError({
        reason: 'invalid_credentials',
        message: 'Invalid email or password',
      })
    }

    // Generate token and create CLI session
    const sessionId = randomUUID()
    const token = randomUUID()
    const now = Date.now()

    yield* sql`
      INSERT INTO session (id, token, user_id, type, device_name, created_at, updated_at, expires_at)
      VALUES (${sessionId}, ${token}, ${userId}, 'cli', ${request.deviceName}, ${now}, ${now}, ${null})
    `.pipe(
      Effect.mapError(
        () =>
          new LoginFailedError({
            reason: 'network_error',
            message: 'Failed to create session',
          }),
      ),
    )

    return { token }
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

describe('/sync/authenticate', () => {
  it.layer(makeTestLayer())((it) => {
    it.effect('valid credentials return token', () =>
      Effect.gen(function* () {
        // Create test user with password
        yield* createTestUser('user-1', 'test@example.com', 'Test User')
        yield* createCredentialAccount('user-1', 'correctPassword123')

        // Call authenticate
        const result = yield* authenticate({
          email: 'test@example.com',
          password: 'correctPassword123',
          deviceName: 'test-device',
        })

        // Verify token returned
        expect(result.token).toBeTruthy()
        expect(typeof result.token).toBe('string')
        expect(result.token.length).toBeGreaterThan(0)
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('invalid password returns LoginFailedError with reason=invalid_credentials', () =>
      Effect.gen(function* () {
        // Create test user
        yield* createTestUser('user-2', 'test2@example.com', 'Test User 2')
        yield* createCredentialAccount('user-2', 'correctPassword123')

        // Call with wrong password
        const result = yield* authenticate({
          email: 'test2@example.com',
          password: 'wrongPassword',
          deviceName: 'test-device',
        }).pipe(Effect.either)

        // Verify error
        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('LoginFailedError')
          const error = result.left as LoginFailedError
          expect(error.reason).toBe('invalid_credentials')
          expect(error.message).toBe('Invalid email or password')
        }
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('nonexistent user returns LoginFailedError', () =>
      Effect.gen(function* () {
        // No user created

        // Call with nonexistent email
        const result = yield* authenticate({
          email: 'nonexistent@example.com',
          password: 'anyPassword',
          deviceName: 'test-device',
        }).pipe(Effect.either)

        // Verify error
        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('LoginFailedError')
          const error = result.left as LoginFailedError
          expect(error.reason).toBe('invalid_credentials')
        }
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('session created with type=cli and device_name', () =>
      Effect.gen(function* () {
        // Create test user
        yield* createTestUser('user-3', 'test3@example.com', 'Test User 3')
        yield* createCredentialAccount('user-3', 'password123')

        // Call authenticate
        const result = yield* authenticate({
          email: 'test3@example.com',
          password: 'password123',
          deviceName: 'my-macbook',
        })

        // Verify session in DB
        const session = yield* getSession(result.token)
        expect(session).toBeTruthy()
        expect(session.user_id).toBe('user-3')
        expect(session.type).toBe('cli')
        expect(session.device_name).toBe('my-macbook')
        expect(session.expires_at).toBeNull() // CLI sessions never expire
      }),
    )
  })

  it.layer(makeTestLayer())((it) => {
    it.effect('user without credential account returns LoginFailedError', () =>
      Effect.gen(function* () {
        // Create user without credential account (e.g., OAuth only user)
        yield* createTestUser('user-4', 'oauth@example.com', 'OAuth User')
        // No credential account created

        // Call authenticate
        const result = yield* authenticate({
          email: 'oauth@example.com',
          password: 'anyPassword',
          deviceName: 'test-device',
        }).pipe(Effect.either)

        // Verify error
        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('LoginFailedError')
          const error = result.left as LoginFailedError
          expect(error.reason).toBe('invalid_credentials')
        }
      }),
    )
  })
})
