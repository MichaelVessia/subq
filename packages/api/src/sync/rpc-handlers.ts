/**
 * Sync RPC handlers for CLI authentication and data synchronization.
 * Validates credentials, creates CLI sessions, and handles sync operations.
 */
import { SqlClient } from '@effect/sql'
import {
  type AuthRequest,
  CliAuthContext,
  LoginFailedError,
  type PullRequest,
  type PullResponse,
  type SyncChange,
  SyncRpcs,
} from '@subq/shared'
import { verifyPassword } from 'better-auth/crypto'
import { Effect, Number as Num, Option, Order, Schema } from 'effect'
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

// Schema for generic sync row (all synced tables have these columns)
const SyncRowSchema = Schema.Struct({
  id: Schema.String,
  updated_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
})

const decodeSyncRow = Schema.decodeUnknown(SyncRowSchema)

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

// Default limit for pull requests
const DEFAULT_PULL_LIMIT = 1000

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

    /**
     * Pull changes from server since cursor timestamp.
     * Queries all synced tables for rows WHERE updated_at > cursor,
     * including soft-deleted rows.
     */
    const SyncPull = Effect.fn('rpc.sync.pull')(function* (request: PullRequest) {
      const sql = yield* SqlClient.SqlClient
      const { userId } = yield* CliAuthContext

      const limit = Option.getOrElse(Option.fromNullable(request.limit), () => DEFAULT_PULL_LIMIT)
      const cursor = request.cursor

      yield* Effect.logInfo('SyncPull called').pipe(
        Effect.annotateLogs({
          rpc: 'SyncPull',
          userId,
          cursor,
          limit,
        }),
      )

      // Query each synced table for changes after cursor
      const queryTable = (table: SyncedTable) =>
        Effect.gen(function* () {
          // Raw query to get all columns. We'll convert to SyncChange format.
          const rows = yield* sql`
            SELECT * FROM ${sql.literal(table)}
            WHERE user_id = ${userId}
              AND updated_at > ${cursor}
            ORDER BY updated_at ASC
          `.pipe(Effect.orDie)

          // Convert rows to SyncChange format
          const changes: Array<SyncChange> = []
          for (const row of rows) {
            const syncRow = yield* decodeSyncRow(row).pipe(Effect.orDie)

            // Determine operation type based on deleted_at
            const operation = syncRow.deleted_at !== null ? 'delete' : 'update'

            // Convert row to payload (plain object)
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

      // Query all tables in parallel
      const allChanges = yield* Effect.all(SYNCED_TABLES.map(queryTable), { concurrency: 'unbounded' })

      // Flatten and sort by timestamp (updated_at)
      const flatChanges: Array<SyncChange> = allChanges.flat()
      const timestampOrder = Order.mapInput(Num.Order, (change: SyncChange) => change.timestamp)
      const sortedChanges = flatChanges.toSorted(timestampOrder)

      // Apply limit and determine if there are more changes
      const hasMore = sortedChanges.length > limit
      const returnedChanges = hasMore ? sortedChanges.slice(0, limit) : sortedChanges

      // Calculate new cursor (max updated_at of returned rows, or keep original if no changes)
      const lastChange = returnedChanges[returnedChanges.length - 1]
      const newCursor = lastChange !== undefined ? new Date(lastChange.timestamp).toISOString() : cursor

      yield* Effect.logInfo('SyncPull completed').pipe(
        Effect.annotateLogs({
          userId,
          changesReturned: returnedChanges.length,
          hasMore,
          newCursor,
        }),
      )

      const response: PullResponse = {
        changes: returnedChanges,
        cursor: newCursor,
        hasMore,
      }

      return response
    })

    return {
      SyncAuthenticate,
      SyncPull,
    }
  }),
)
