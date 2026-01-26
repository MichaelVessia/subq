/**
 * Sync Lifecycle Service for TUI
 *
 * Manages sync operations:
 * - Sync on startup
 * - Background sync every 30 seconds
 * - Sync on exit with 5s timeout
 * - Graceful shutdown handling
 */
import { Context, Duration, Effect, Fiber, Option } from 'effect'
import { type SyncError } from '@subq/local'

// ============================================
// Constants
// ============================================

/** Background sync interval */
export const SYNC_INTERVAL = Duration.seconds(30)

/** Shutdown sync timeout */
export const SHUTDOWN_TIMEOUT = Duration.seconds(5)

// ============================================
// Sync Status
// ============================================

/** Sync status for UI display */
export type SyncStatus =
  | { readonly _tag: 'syncing' }
  | { readonly _tag: 'synced'; readonly lastSync: Date }
  | { readonly _tag: 'offline' }
  | { readonly _tag: 'error'; readonly message: string }

// ============================================
// Error Handling
// ============================================

/**
 * Handles sync errors by logging them with context.
 * Returns the sync error for status tracking.
 */
export const handleSyncError =
  <R>(
    context: 'initial' | 'background' | 'shutdown',
  ): ((effect: Effect.Effect<void, SyncError, R>) => Effect.Effect<Option.Option<SyncError>, never, R>) =>
  (effect) =>
    effect.pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) => {
          // Extract the error from the cause
          const error = cause._tag === 'Fail' ? Option.some(cause.error) : Option.none<SyncError>()
          return Option.match(error, {
            onNone: () =>
              // Defect or interrupt, not a sync error
              Effect.succeed(Option.none()),
            onSome: (e) =>
              Effect.gen(function* () {
                const message = e._tag === 'SyncNetworkError' ? `network: ${e.message}` : `auth: ${e.message}`
                yield* Effect.logWarning(`Sync failed (${context}): ${message}`)
                return Option.some<SyncError>(e)
              }),
          })
        },
        onSuccess: () => Effect.succeed(Option.none()),
      }),
    )

// ============================================
// Service Interface
// ============================================

export interface SyncLifecycleService {
  /**
   * Run initial sync on startup.
   * Errors are logged but don't prevent TUI from starting.
   */
  readonly runStartupSync: () => Effect.Effect<Option.Option<SyncError>>

  /**
   * Start background sync fiber (runs every 30s).
   * Returns the fiber handle for interruption.
   */
  readonly startBackgroundSync: () => Effect.Effect<Fiber.RuntimeFiber<never, SyncError>>

  /**
   * Run shutdown sync with timeout.
   * Returns error if sync fails or times out.
   */
  readonly runShutdownSync: () => Effect.Effect<Option.Option<SyncError>>

  /**
   * Check if user is logged in (has auth token).
   */
  readonly isLoggedIn: () => Effect.Effect<boolean>
}

// ============================================
// Service Tag
// ============================================

export class SyncLifecycle extends Context.Tag('@subq/tui/SyncLifecycle')<SyncLifecycle, SyncLifecycleService>() {}

// ============================================
// TUI Lifecycle Effect
// ============================================

/**
 * Run the TUI with sync lifecycle management.
 *
 * 1. Sync on launch
 * 2. Background sync every 30s
 * 3. Sync on exit with 5s timeout
 * 4. Ctrl+C triggers graceful shutdown with sync attempt
 *
 * @param tui - The TUI effect to run
 */
export const runWithSyncLifecycle = <E, R>(tui: Effect.Effect<void, E, R>): Effect.Effect<void, E, R | SyncLifecycle> =>
  Effect.gen(function* () {
    const lifecycle = yield* SyncLifecycle

    // Check if logged in first
    const loggedIn = yield* lifecycle.isLoggedIn()

    if (!loggedIn) {
      // Not logged in, just run the TUI without sync
      yield* Effect.logInfo('Not logged in, skipping sync lifecycle')
      yield* tui
      return
    }

    // 1. Sync on launch
    yield* lifecycle.runStartupSync()

    // 2. Start background sync
    const syncFiber = yield* lifecycle.startBackgroundSync()

    // 3. Run TUI with shutdown handling
    yield* tui.pipe(
      Effect.onInterrupt(() =>
        Effect.gen(function* () {
          // Stop background sync
          yield* Fiber.interrupt(syncFiber)
          // Sync on exit
          yield* lifecycle.runShutdownSync()
        }),
      ),
      Effect.ensuring(
        Effect.gen(function* () {
          // Stop background sync
          yield* Fiber.interrupt(syncFiber)
          // Sync on exit
          yield* lifecycle.runShutdownSync()
        }),
      ),
    )
  })
