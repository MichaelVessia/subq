/**
 * Sync command for CLI manual synchronization.
 * Pulls changes from server, applies locally, then pushes local changes.
 * Shows progress output during sync.
 */
import { Command } from '@effect/cli'
import { FetchHttpClient } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { SyncAuthError, SyncNetworkError } from '@subq/shared'
import { Console, Effect, Layer, Option } from 'effect'
import pc from 'picocolors'
import { error, success } from '../lib/output.js'
import { LocalConfig, LocalDb, RemoteClient, ensureSchema } from '@subq/local'

// ============================================
// Constants
// ============================================

const BATCH_SIZE = 1000
const DEFAULT_CURSOR = '1970-01-01T00:00:00Z'

// ============================================
// Sync with Progress
// ============================================

/**
 * Result of sync operation for progress tracking.
 */
interface SyncResult {
  readonly pullCount: number
  readonly pushCount: number
}

/**
 * Pull phase with progress tracking.
 * Returns total number of changes pulled.
 */
const pullWithProgress = Effect.gen(function* () {
  const local = yield* LocalDb
  const remote = yield* RemoteClient

  // Get current cursor
  const cursorOption = yield* local.getMeta('last_sync_cursor')
  let cursor = Option.getOrElse(cursorOption, () => DEFAULT_CURSOR)
  let hasMore = true
  let totalChanges = 0

  // Paginate through all changes
  while (hasMore) {
    const pulled = yield* remote.pull({ cursor, limit: BATCH_SIZE })
    totalChanges += pulled.changes.length

    // Apply changes to local database
    yield* local.applyChanges(pulled.changes)

    // Update cursor for next iteration
    cursor = pulled.cursor
    hasMore = pulled.hasMore
  }

  // Store the final cursor
  yield* local.setMeta('last_sync_cursor', cursor)

  return totalChanges
})

/**
 * Push phase with progress tracking.
 * Returns total number of changes pushed.
 */
const pushWithProgress = Effect.gen(function* () {
  const local = yield* LocalDb
  const remote = yield* RemoteClient

  let totalChanges = 0

  // Get first batch of outbox entries
  let outbox = yield* local.getOutbox({ limit: BATCH_SIZE })

  // Process batches until outbox is empty
  while (outbox.length > 0) {
    totalChanges += outbox.length

    const result = yield* remote.push({ changes: outbox })

    // Clear accepted entries from outbox
    if (result.accepted.length > 0) {
      yield* local.clearOutbox(result.accepted)
    }

    // Handle conflicts: apply server version and remove from outbox
    for (const conflict of result.conflicts) {
      yield* local.applyServerVersion(conflict)
      yield* local.removeFromOutbox(conflict.id)
    }

    // Get next batch
    outbox = yield* local.getOutbox({ limit: BATCH_SIZE })
  }

  return totalChanges
})

/**
 * Sync with progress output.
 * Wraps in transaction for atomicity.
 */
const syncWithProgress = (): Effect.Effect<
  SyncResult,
  SyncNetworkError | SyncAuthError,
  LocalDb | RemoteClient | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        // Pull phase
        yield* Console.log(pc.dim('Pulling...'))
        const pullCount = yield* pullWithProgress
        if (pullCount > 0) {
          yield* Console.log(`Pulling... ${pullCount} changes`)
        }

        // Push phase
        yield* Console.log(pc.dim('Pushing...'))
        const pushCount = yield* pushWithProgress
        if (pushCount > 0) {
          yield* Console.log(`Pushing... ${pushCount} changes`)
        }

        return { pullCount, pushCount }
      }),
    )
  })

// ============================================
// Helpers
// ============================================

/**
 * Create database layer for local SQLite.
 */
const makeDbLayer = () => {
  const home = process.env.HOME ?? '~'
  const dbPath = `${home}/.subq/data.db`

  return SqliteClient.layer({
    filename: dbPath,
  })
}

// ============================================
// Command
// ============================================

export const syncCommand = Command.make('sync', {}, () =>
  Effect.gen(function* () {
    // Check for auth token (require login)
    const maybeToken = yield* Effect.gen(function* () {
      const config = yield* LocalConfig
      return yield* config.getAuthToken()
    }).pipe(Effect.provide(LocalConfig.Default))

    if (Option.isNone(maybeToken)) {
      yield* error('Not logged in. Please run "subq login" first.')
      return
    }

    // Build the sync layer
    const dbLayer = makeDbLayer()
    const localDbLayer = LocalDb.layer.pipe(Layer.provide(dbLayer), Layer.provide(BunContext.layer))

    const syncLayer = Layer.mergeAll(
      localDbLayer,
      RemoteClient.Default.pipe(Layer.provide(FetchHttpClient.layer)),
      dbLayer,
    )

    // Run sync with progress output
    const syncResult = yield* Effect.gen(function* () {
      // Ensure schema is up to date
      yield* ensureSchema()
      // Run sync
      return yield* syncWithProgress()
    }).pipe(Effect.provide(syncLayer), Effect.scoped, Effect.either)

    if (syncResult._tag === 'Left') {
      const err = syncResult.left
      const message = getSyncErrorMessage(err)
      yield* error(message)
      return
    }

    yield* success('Done.')
  }),
).pipe(Command.withDescription('Sync local data with server'))

// ============================================
// Error Message Helpers
// ============================================

const getSyncErrorMessage = (err: SyncNetworkError | SyncAuthError): string => {
  if (err._tag === 'SyncNetworkError') {
    return `Sync failed: ${err.message}`
  }
  return 'Sync failed: authentication error. Please run "subq login" again.'
}
