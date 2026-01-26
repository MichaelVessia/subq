/**
 * Sync RPC handlers for CLI authentication.
 * Validates credentials and creates CLI sessions with never-expiring tokens.
 */
import { SqlClient } from '@effect/sql'
import { type AuthRequest, LoginFailedError, SyncRpcs } from '@subq/shared'
import { verifyPassword } from 'better-auth/crypto'
import { Effect, Schema } from 'effect'
import { randomUUID } from 'node:crypto'

// ============================================
// Database Query Schemas
// ============================================

const UserRow = Schema.Struct({
  id: Schema.String,
})

const AccountRow = Schema.Struct({
  user_id: Schema.String,
  password: Schema.String,
})

const decodeUserRow = Schema.decodeUnknown(UserRow)
const decodeAccountRow = Schema.decodeUnknown(AccountRow)

// ============================================
// Sync RPC Handlers
// ============================================

export const SyncRpcHandlersLive = SyncRpcs.toLayer(
  Effect.gen(function* () {
    const SyncAuthenticate = Effect.fn('rpc.sync.authenticate')(function* (request: AuthRequest) {
      const sql = yield* SqlClient.SqlClient

      yield* Effect.logInfo('SyncAuthenticate called').pipe(
        Effect.annotateLogs({
          rpc: 'SyncAuthenticate',
          email: request.email,
          deviceName: request.deviceName,
        }),
      )

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
        yield* Effect.logWarning('SyncAuthenticate: user not found').pipe(Effect.annotateLogs({ email: request.email }))
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
        yield* Effect.logWarning('SyncAuthenticate: no credential account found').pipe(Effect.annotateLogs({ userId }))
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
      const isValid = yield* Effect.promise(() =>
        verifyPassword({ hash: account.password, password: request.password }),
      )

      if (!isValid) {
        yield* Effect.logWarning('SyncAuthenticate: invalid password').pipe(Effect.annotateLogs({ userId }))
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

      yield* Effect.logInfo('SyncAuthenticate: CLI session created').pipe(
        Effect.annotateLogs({
          userId,
          sessionId,
          deviceName: request.deviceName,
        }),
      )

      return { token }
    })

    return {
      SyncAuthenticate,
    }
  }),
)
