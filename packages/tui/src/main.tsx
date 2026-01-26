/**
 * TUI Main Entry Point
 *
 * Manages the TUI lifecycle with sync integration:
 * 1. Sync on startup (with error handling)
 * 2. Background sync every 30 seconds
 * 3. Sync on exit with 5s timeout
 * 4. Ctrl+C triggers graceful shutdown with sync attempt
 */
import { FetchHttpClient } from '@effect/platform'
import { BunContext, BunRuntime } from '@effect/platform-bun'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { createCliRenderer } from '@opentui/core'
import { createRoot, type Root } from '@opentui/react'
import { Effect, Fiber, Layer, Option } from 'effect'
import { App } from './app'
import { LocalConfig, LocalDb, RemoteClient, sync, ensureSchema } from '@subq/local'
import { SHUTDOWN_TIMEOUT, SYNC_INTERVAL } from './services/sync-lifecycle'
import { setSyncStatus, SyncStatus } from './services/sync-status'
import { theme } from './theme'

// ============================================
// State
// ============================================

let backgroundSyncFiber: Fiber.RuntimeFiber<never, unknown> | null = null
let tuiRoot: Root | null = null
let isShuttingDown = false

// ============================================
// Layer Setup
// ============================================

const makeDbLayer = () => {
  const home = process.env.HOME ?? '~'
  const dbPath = `${home}/.subq/data.db`
  return SqliteClient.layer({ filename: dbPath })
}

const makeSyncLayer = () => {
  const dbLayer = makeDbLayer()
  const localDbLayer = LocalDb.layer.pipe(Layer.provide(dbLayer), Layer.provide(BunContext.layer))

  return Layer.mergeAll(
    localDbLayer,
    RemoteClient.Default.pipe(Layer.provide(FetchHttpClient.layer)),
    dbLayer,
    LocalConfig.Default,
  ).pipe(Layer.provide(BunContext.layer))
}

// ============================================
// Sync Operations
// ============================================

/**
 * Run a sync operation with error handling.
 * Updates sync status and logs errors but doesn't crash the TUI.
 */
const runSyncSafe = (context: string) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Starting ${context} sync`)
    setSyncStatus(SyncStatus.syncing())

    yield* sync().pipe(
      Effect.tap(() => {
        setSyncStatus(SyncStatus.synced(new Date()))
      }),
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          // Set appropriate status based on error type
          if (error._tag === 'SyncNetworkError') {
            setSyncStatus(SyncStatus.offline())
          } else {
            setSyncStatus(SyncStatus.error(error.message))
          }
          yield* Effect.logWarning(`${context} sync failed: ${error._tag} - ${error.message}`)
        }),
      ),
    )
    yield* Effect.logInfo(`${context} sync completed`)
  })

/**
 * Start the background sync fiber.
 * Runs sync every 30 seconds.
 */
const startBackgroundSync = Effect.gen(function* () {
  yield* Effect.logInfo('Starting background sync fiber')

  const fiber = yield* runSyncSafe('background').pipe(Effect.delay(SYNC_INTERVAL), Effect.forever, Effect.forkDaemon)

  return fiber
})

// ============================================
// Shutdown Handling
// ============================================

/**
 * Run shutdown sync with timeout.
 */
const runShutdownSync = Effect.gen(function* () {
  yield* Effect.logInfo('Running shutdown sync')
  yield* runSyncSafe('shutdown').pipe(
    Effect.timeout(SHUTDOWN_TIMEOUT),
    Effect.catchTag('TimeoutException', () => Effect.logWarning('Shutdown sync timed out')),
  )
})

/**
 * Graceful shutdown handler.
 * Stops background sync, runs final sync, then exits.
 */
const shutdown = async (_signal: string, exitCode = 0) => {
  if (isShuttingDown) return
  isShuttingDown = true

  // Disable bracketed paste mode
  process.stdout.write('\x1b[?2004l')

  // Unmount React
  if (tuiRoot) {
    tuiRoot.unmount()
    tuiRoot = null
  }

  // Check if logged in before attempting sync
  const isLoggedIn = await Effect.gen(function* () {
    const config = yield* LocalConfig
    const token = yield* config.getAuthToken()
    return Option.isSome(token)
  }).pipe(
    Effect.provide(LocalConfig.Default),
    Effect.catchAll(() => Effect.succeed(false)),
    Effect.runPromise,
  )

  if (isLoggedIn) {
    // Stop background sync fiber
    if (backgroundSyncFiber) {
      await Effect.runPromise(Fiber.interrupt(backgroundSyncFiber).pipe(Effect.catchAll(() => Effect.void)))
      backgroundSyncFiber = null
    }

    // Run shutdown sync
    const syncLayer = makeSyncLayer()
    await Effect.runPromise(
      runShutdownSync.pipe(
        Effect.provide(syncLayer),
        Effect.scoped,
        Effect.catchAll((error) => Effect.logWarning(`Shutdown sync error: ${error}`)),
      ),
    )
  }

  process.exit(exitCode)
}

// ============================================
// Main
// ============================================

const main = Effect.gen(function* () {
  // Check if logged in
  const isLoggedIn = yield* Effect.gen(function* () {
    const config = yield* LocalConfig
    const token = yield* config.getAuthToken()
    return Option.isSome(token)
  }).pipe(
    Effect.provide(LocalConfig.Default),
    Effect.catchAll(() => Effect.succeed(false)),
  )

  if (isLoggedIn) {
    // Ensure schema is up to date
    const syncLayer = makeSyncLayer()

    yield* ensureSchema.pipe(
      Effect.provide(syncLayer),
      Effect.scoped,
      Effect.catchAll((error) => Effect.logWarning(`Schema check failed: ${error}`)),
    )

    // Run startup sync
    yield* runSyncSafe('startup').pipe(Effect.provide(syncLayer), Effect.scoped)

    // Start background sync
    const fiber = yield* startBackgroundSync.pipe(Effect.provide(syncLayer), Effect.scoped)
    backgroundSyncFiber = fiber
  } else {
    yield* Effect.logInfo('Not logged in, skipping sync')
  }

  // Enable bracketed paste mode for clipboard support
  process.stdout.write('\x1b[?2004h')

  // Create renderer
  const renderer = yield* Effect.promise(() =>
    createCliRenderer({
      exitOnCtrlC: false, // We handle Ctrl+C ourselves for graceful shutdown
      backgroundColor: theme.bg,
    }),
  )

  // Set up signal handlers for graceful shutdown
  process.on('SIGINT', () => shutdown('SIGINT', 0))
  process.on('SIGTERM', () => shutdown('SIGTERM', 0))

  // Disable bracketed paste mode on normal exit
  process.on('exit', () => {
    process.stdout.write('\x1b[?2004l')
  })

  // Render the TUI
  tuiRoot = createRoot(renderer)
  tuiRoot.render(<App />)
})

// Run the main effect
BunRuntime.runMain(main.pipe(Effect.provide(BunContext.layer)))
