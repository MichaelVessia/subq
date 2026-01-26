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
  type PushRequest,
  type PushResponse,
  type SyncChange,
  type SyncConflict,
  SyncRpcs,
} from '@subq/shared'
import { verifyPassword } from 'better-auth/crypto'
import { Clock, Effect, Number as Num, Option, Order, Schema } from 'effect'
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

    /**
     * Push local changes to server.
     * For each change: check if row.updated_at > change.timestamp (conflict detection).
     * Conflict: reject change, include server version in conflicts array.
     * No conflict: apply insert/update/delete, add id to accepted array.
     * Soft delete: set deleted_at instead of DELETE.
     */
    const SyncPush = Effect.fn('rpc.sync.push')(function* (request: PushRequest) {
      const sql = yield* SqlClient.SqlClient
      const { userId } = yield* CliAuthContext
      const clock = yield* Clock.Clock

      yield* Effect.logInfo('SyncPush called').pipe(
        Effect.annotateLogs({
          rpc: 'SyncPush',
          userId,
          changeCount: request.changes.length,
        }),
      )

      const accepted: Array<string> = []
      const conflicts: Array<SyncConflict> = []

      // Get current time for setting updated_at
      const now = yield* clock.currentTimeMillis
      const nowIso = new Date(now).toISOString()

      // Process each change within a transaction
      yield* sql
        .withTransaction(
          Effect.forEach(
            request.changes,
            (change) =>
              Effect.gen(function* () {
                // Validate table name is in allowed list
                if (!SYNCED_TABLES.includes(change.table as SyncedTable)) {
                  yield* Effect.logWarning('SyncPush: invalid table name').pipe(
                    Effect.annotateLogs({ table: change.table, changeId: change.id }),
                  )
                  return
                }

                const table = change.table as SyncedTable

                if (change.operation === 'insert') {
                  // For insert, check if row already exists
                  const existingRows = yield* sql`
                    SELECT id, updated_at FROM ${sql.literal(table)}
                    WHERE id = ${change.id} AND user_id = ${userId}
                  `.pipe(Effect.orDie)

                  if (existingRows.length > 0) {
                    // Row exists, treat as conflict (server version wins)
                    const serverRow = yield* getServerRow(sql, table, change.id, userId)
                    if (Option.isSome(serverRow)) {
                      conflicts.push({
                        id: change.id,
                        serverVersion: serverRow.value,
                      })
                    }
                    return
                  }

                  // Insert new row
                  yield* insertRow(sql, table, change.payload, userId, nowIso)
                  accepted.push(change.id)
                } else if (change.operation === 'update') {
                  // Check for conflict: server row newer than change timestamp
                  const serverRows = yield* sql`
                    SELECT updated_at FROM ${sql.literal(table)}
                    WHERE id = ${change.id} AND user_id = ${userId}
                  `.pipe(Effect.orDie)

                  if (serverRows.length === 0) {
                    // Row doesn't exist, treat as insert
                    yield* insertRow(sql, table, change.payload, userId, nowIso)
                    accepted.push(change.id)
                    return
                  }

                  const serverUpdatedAt = yield* decodeSyncRow({
                    ...serverRows[0],
                    id: change.id,
                    deleted_at: null,
                  }).pipe(
                    Effect.map((r) => new Date(r.updated_at).getTime()),
                    Effect.orDie,
                  )

                  if (serverUpdatedAt > change.timestamp) {
                    // Conflict: server version is newer
                    const serverRow = yield* getServerRow(sql, table, change.id, userId)
                    if (Option.isSome(serverRow)) {
                      conflicts.push({
                        id: change.id,
                        serverVersion: serverRow.value,
                      })
                    }
                    return
                  }

                  // No conflict, apply update
                  yield* updateRow(sql, table, change.payload, change.id, userId, nowIso)
                  accepted.push(change.id)
                } else if (change.operation === 'delete') {
                  // Check for conflict: server row newer than change timestamp
                  const serverRows = yield* sql`
                    SELECT updated_at FROM ${sql.literal(table)}
                    WHERE id = ${change.id} AND user_id = ${userId}
                  `.pipe(Effect.orDie)

                  if (serverRows.length === 0) {
                    // Row doesn't exist, nothing to delete
                    accepted.push(change.id)
                    return
                  }

                  const serverUpdatedAt = yield* decodeSyncRow({
                    ...serverRows[0],
                    id: change.id,
                    deleted_at: null,
                  }).pipe(
                    Effect.map((r) => new Date(r.updated_at).getTime()),
                    Effect.orDie,
                  )

                  if (serverUpdatedAt > change.timestamp) {
                    // Conflict: server version is newer
                    const serverRow = yield* getServerRow(sql, table, change.id, userId)
                    if (Option.isSome(serverRow)) {
                      conflicts.push({
                        id: change.id,
                        serverVersion: serverRow.value,
                      })
                    }
                    return
                  }

                  // No conflict, apply soft delete
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
        .pipe(Effect.orDie)

      yield* Effect.logInfo('SyncPush completed').pipe(
        Effect.annotateLogs({
          userId,
          acceptedCount: accepted.length,
          conflictCount: conflicts.length,
        }),
      )

      const response: PushResponse = {
        accepted,
        conflicts,
      }

      return response
    })

    return {
      SyncAuthenticate,
      SyncPull,
      SyncPush,
    }
  }),
)

// ============================================
// Helper Functions for Push Operations
// ============================================

/**
 * Get full server row data for conflict response.
 */
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
      const firstRow = rows[0]
      if (firstRow === undefined) {
        return Option.none()
      }
      const payload: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(firstRow)) {
        payload[key] = value
      }
      return Option.some(payload)
    }),
    Effect.orDie,
  )

/**
 * Insert a new row into a synced table.
 */
const insertRow = (
  sql: SqlClient.SqlClient,
  table: SyncedTable,
  payload: Record<string, unknown>,
  userId: string,
  nowIso: string,
): Effect.Effect<void, never, never> => {
  // Build column list and values based on table
  // We need to map payload keys to column names (snake_case)
  const columns: Array<string> = []
  const values: Array<unknown> = []

  for (const [key, value] of Object.entries(payload)) {
    // Skip user_id from payload, we'll set it explicitly
    if (key === 'user_id') continue
    columns.push(key)
    values.push(value)
  }

  // Add user_id, created_at, updated_at
  columns.push('user_id')
  values.push(userId)

  // Override timestamps with server time if not already in payload
  if (!columns.includes('created_at')) {
    columns.push('created_at')
    values.push(nowIso)
  }
  if (!columns.includes('updated_at')) {
    columns.push('updated_at')
    values.push(nowIso)
  } else {
    // Update the updated_at to server time
    const idx = columns.indexOf('updated_at')
    values[idx] = nowIso
  }

  const columnsSql = columns.map((c) => `"${c}"`).join(', ')
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')

  return sql
    .unsafe(`INSERT INTO "${table}" (${columnsSql}) VALUES (${placeholders})`, values)
    .pipe(Effect.asVoid, Effect.orDie)
}

/**
 * Update an existing row in a synced table.
 */
const updateRow = (
  sql: SqlClient.SqlClient,
  table: SyncedTable,
  payload: Record<string, unknown>,
  id: string,
  userId: string,
  nowIso: string,
): Effect.Effect<void, never, never> => {
  // Build SET clause from payload
  const setClauses: Array<string> = []
  const values: Array<unknown> = []
  let paramIndex = 1

  for (const [key, value] of Object.entries(payload)) {
    // Skip id, user_id, created_at from updates
    if (key === 'id' || key === 'user_id' || key === 'created_at') continue
    setClauses.push(`"${key}" = $${paramIndex}`)
    values.push(value)
    paramIndex++
  }

  // Always update updated_at to server time
  setClauses.push(`"updated_at" = $${paramIndex}`)
  values.push(nowIso)
  paramIndex++

  // Add WHERE clause params
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
