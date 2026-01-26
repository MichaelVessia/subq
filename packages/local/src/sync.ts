/**
 * Sync Flow - Orchestrates pull/push synchronization between local and remote
 *
 * Implements the sync protocol:
 * 1. Pull phase: paginate through all changes since cursor
 * 2. Apply pulled changes to local DB
 * 3. Update last_sync_cursor after pull
 * 4. Push phase: send outbox entries in batches of 1000
 * 5. Handle conflicts: apply server version, remove from outbox
 * 6. Clear accepted from outbox
 * 7. Entire sync wrapped in sql.withTransaction
 */
import { SqlClient } from '@effect/sql'
import { SyncAuthError, SyncNetworkError } from '@subq/shared'
import { Effect, Option } from 'effect'
import { LocalDb, type LocalDbService } from './services/LocalDb.js'
import { RemoteClient, type RemoteClientService } from './services/RemoteClient.js'

/** Batch size for push operations (max 1000 per push request) */
const PUSH_BATCH_SIZE = 1000

/** Default cursor for initial sync (epoch) */
const DEFAULT_CURSOR = '1970-01-01T00:00:00Z'

/** Union type for sync errors */
export type SyncError = SyncNetworkError | SyncAuthError

/**
 * Main sync function that pulls changes from server, applies them locally,
 * then pushes local changes to server.
 *
 * The entire operation is wrapped in a transaction for atomicity.
 * If any network call fails, the transaction rolls back.
 */
export const sync = (): Effect.Effect<void, SyncError, LocalDb | RemoteClient | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const local = yield* LocalDb
    const remote = yield* RemoteClient
    const sql = yield* SqlClient.SqlClient

    yield* sql.withTransaction(
      Effect.gen(function* () {
        // Phase 1: Pull changes from server
        yield* pullPhase(local, remote)

        // Phase 2: Push local changes to server
        yield* pushPhase(local, remote)
      }),
    )
  })

/**
 * Pull phase: fetch all changes from server since last cursor.
 * Paginates through results until hasMore=false.
 */
const pullPhase = (local: LocalDbService, remote: RemoteClientService): Effect.Effect<void, SyncError, never> =>
  Effect.gen(function* () {
    // Get current cursor, default to epoch if not set
    const cursorOption = yield* local.getMeta('last_sync_cursor')
    let cursor = Option.getOrElse(cursorOption, () => DEFAULT_CURSOR)
    let hasMore = true

    // Paginate through all changes
    while (hasMore) {
      const pulled = yield* remote.pull({ cursor, limit: PUSH_BATCH_SIZE })

      // Apply changes to local database
      yield* local.applyChanges(pulled.changes)

      // Update cursor for next iteration
      cursor = pulled.cursor
      hasMore = pulled.hasMore
    }

    // Store the final cursor
    yield* local.setMeta('last_sync_cursor', cursor)
  })

/**
 * Push phase: send all outbox entries to server in batches.
 * Handles conflicts by applying server version and removing from outbox.
 */
const pushPhase = (local: LocalDbService, remote: RemoteClientService): Effect.Effect<void, SyncError, never> =>
  Effect.gen(function* () {
    // Get first batch of outbox entries
    let outbox = yield* local.getOutbox({ limit: PUSH_BATCH_SIZE })

    // Process batches until outbox is empty
    while (outbox.length > 0) {
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
      outbox = yield* local.getOutbox({ limit: PUSH_BATCH_SIZE })
    }
  })
