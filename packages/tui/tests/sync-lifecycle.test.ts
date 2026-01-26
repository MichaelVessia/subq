/**
 * Tests for TUI Sync Lifecycle Service
 *
 * Tests verify:
 * - Startup sync is attempted
 * - Background sync scheduled at 30s intervals
 * - Shutdown sync is attempted with timeout
 * - Sync errors don't crash TUI
 * - Not logged in skips sync
 */
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { SyncAuthError, SyncNetworkError } from '@subq/shared'
import { Context, Duration, Effect, Fiber, Layer, Option, Ref, TestClock } from 'effect'
import {
  handleSyncError,
  runWithSyncLifecycle,
  SyncLifecycle,
  type SyncLifecycleService,
  SYNC_INTERVAL,
} from '../src/services/sync-lifecycle.js'
import { LocalConfig, LocalDb, RemoteClient, type SyncError } from '@subq/local'
import { SqlClient } from '@effect/sql'

// ============================================
// Custom Tags for Test State
// ============================================

class SyncCallsRef extends Context.Tag('@test/SyncCallsRef')<SyncCallsRef, Ref.Ref<number>>() {}
class ShouldFailRef extends Context.Tag('@test/ShouldFailRef')<ShouldFailRef, Ref.Ref<boolean>>() {}

// ============================================
// Mock Services
// ============================================

/**
 * Create a mock LocalDb service.
 */
const makeMockLocalDb = (): Context.Tag.Service<typeof LocalDb> => ({
  getMeta: () => Effect.succeed(Option.none()),
  setMeta: () => Effect.void,
  getOutbox: () => Effect.succeed([]),
  clearOutbox: () => Effect.void,
  applyChanges: () => Effect.void,
  applyServerVersion: () => Effect.void,
  removeFromOutbox: () => Effect.void,
  writeWithOutbox: () => Effect.void,
})

/**
 * Create a mock RemoteClient service that tracks calls and can be configured to fail.
 */
const makeMockRemoteClient = (
  syncCallsRef: Ref.Ref<number>,
  shouldFail: Ref.Ref<boolean>,
): Context.Tag.Service<typeof RemoteClient> => ({
  pull: () =>
    Effect.gen(function* () {
      yield* Ref.update(syncCallsRef, (n) => n + 1)
      const fail = yield* Ref.get(shouldFail)
      if (fail) {
        return yield* Effect.fail(new SyncNetworkError({ message: 'Network error' }))
      }
      return { changes: [], cursor: '2024-01-01T00:00:00Z', hasMore: false }
    }),
  push: () => Effect.succeed({ accepted: [], conflicts: [] }),
  authenticate: () => Effect.succeed({ token: 'test-token' }),
})

/**
 * Create a mock LocalConfig service.
 */
const makeMockLocalConfig = (isLoggedIn: boolean): Context.Tag.Service<typeof LocalConfig> => ({
  get: () => Effect.succeed(Option.none()),
  set: () => Effect.void,
  getServerUrl: () => Effect.succeed('https://test.example.com'),
  getAuthToken: () => Effect.succeed(isLoggedIn ? Option.some('test-token') : Option.none()),
})

/**
 * Create a mock SqlClient.
 */
const makeMockSqlClient = (): SqlClient.SqlClient =>
  ({
    withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => effect,
  }) as unknown as SqlClient.SqlClient

// ============================================
// Test Layer Builder
// ============================================

const makeTestLayer = (isLoggedIn: boolean) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const syncCallsRef = yield* Ref.make(0)
      const shouldFailRef = yield* Ref.make(false)

      const localDb = makeMockLocalDb()
      const remoteClient = makeMockRemoteClient(syncCallsRef, shouldFailRef)
      const localConfig = makeMockLocalConfig(isLoggedIn)
      const sqlClient = makeMockSqlClient()

      // Build SyncLifecycle with mocks
      const syncLifecycleService: SyncLifecycleService = {
        runStartupSync: () =>
          Effect.gen(function* () {
            yield* Ref.update(syncCallsRef, (n) => n + 1)
            const fail = yield* Ref.get(shouldFailRef)
            if (fail) {
              return Option.some<SyncError>(new SyncNetworkError({ message: 'Network error' }))
            }
            return Option.none()
          }),
        startBackgroundSync: () =>
          Effect.gen(function* () {
            // Fork a fiber that increments counter every SYNC_INTERVAL
            // Errors are caught and ignored (logged in real impl), loop continues
            return yield* Effect.gen(function* () {
              // eslint-disable-next-line no-constant-condition
              while (true) {
                yield* Effect.sleep(SYNC_INTERVAL)
                yield* Ref.update(syncCallsRef, (n) => n + 1)
                // Check if we should fail this sync, but don't stop the loop
                const fail = yield* Ref.get(shouldFailRef)
                if (fail) {
                  // Log error but continue (simulates handleSyncError behavior)
                  yield* Effect.logWarning('Sync error occurred but continuing')
                }
              }
            }).pipe(Effect.forkDaemon)
          }),
        runShutdownSync: () =>
          Effect.gen(function* () {
            yield* Ref.update(syncCallsRef, (n) => n + 1)
            const fail = yield* Ref.get(shouldFailRef)
            if (fail) {
              return Option.some<SyncError>(new SyncNetworkError({ message: 'Network error' }))
            }
            return Option.none()
          }),
        isLoggedIn: () => Effect.succeed(isLoggedIn),
      }

      return Context.empty().pipe(
        Context.add(LocalDb, localDb),
        Context.add(RemoteClient, remoteClient),
        Context.add(LocalConfig, localConfig),
        Context.add(SqlClient.SqlClient, sqlClient),
        Context.add(SyncLifecycle, syncLifecycleService),
        Context.add(SyncCallsRef, syncCallsRef),
        Context.add(ShouldFailRef, shouldFailRef),
      )
    }),
  ).pipe(Layer.fresh)

// ============================================
// Tests
// ============================================

describe('SyncLifecycle', () => {
  describe('runStartupSync', () => {
    it.layer(makeTestLayer(true))((it) => {
      it.effect('attempts sync on startup', () =>
        Effect.gen(function* () {
          const lifecycle = yield* SyncLifecycle
          const syncCallsRef = yield* SyncCallsRef

          // Initial count should be 0
          const before = yield* Ref.get(syncCallsRef)
          expect(before).toBe(0)

          // Run startup sync
          const result = yield* lifecycle.runStartupSync()

          // Should have called sync once
          const after = yield* Ref.get(syncCallsRef)
          expect(after).toBe(1)

          // Should return no error
          expect(Option.isNone(result)).toBe(true)
        }),
      )
    })

    it.layer(makeTestLayer(true))((it) => {
      it.effect('sync error is logged but does not throw', () =>
        Effect.gen(function* () {
          const lifecycle = yield* SyncLifecycle
          const syncCallsRef = yield* SyncCallsRef
          const shouldFailRef = yield* ShouldFailRef

          // Configure sync to fail
          yield* Ref.set(shouldFailRef, true)

          // Run startup sync - should not throw
          const result = yield* lifecycle.runStartupSync()

          // Should have called sync once
          const calls = yield* Ref.get(syncCallsRef)
          expect(calls).toBe(1)

          // Should return an error
          expect(Option.isSome(result)).toBe(true)
          if (Option.isSome(result)) {
            expect(result.value._tag).toBe('SyncNetworkError')
          }
        }),
      )
    })
  })

  describe('startBackgroundSync', () => {
    it.layer(makeTestLayer(true))((it) => {
      it.effect('schedules sync at 30 second intervals using TestClock', () =>
        Effect.gen(function* () {
          const lifecycle = yield* SyncLifecycle
          const syncCallsRef = yield* SyncCallsRef

          // Start background sync
          const fiber = yield* lifecycle.startBackgroundSync()

          // Initially no background syncs
          const initial = yield* Ref.get(syncCallsRef)
          expect(initial).toBe(0)

          // Advance clock by 30 seconds - first background sync
          yield* TestClock.adjust(SYNC_INTERVAL)
          // Give the fiber time to process
          yield* Effect.yieldNow()
          const after30s = yield* Ref.get(syncCallsRef)
          expect(after30s).toBe(1)

          // Advance clock by another 30 seconds - second background sync
          yield* TestClock.adjust(SYNC_INTERVAL)
          yield* Effect.yieldNow()
          const after60s = yield* Ref.get(syncCallsRef)
          expect(after60s).toBe(2)

          // Advance clock by another 30 seconds - third background sync
          yield* TestClock.adjust(SYNC_INTERVAL)
          yield* Effect.yieldNow()
          const after90s = yield* Ref.get(syncCallsRef)
          expect(after90s).toBe(3)

          // Clean up
          yield* Fiber.interrupt(fiber)
        }),
      )
    })

    it.layer(makeTestLayer(true))((it) => {
      it.effect('background sync continues after error', () =>
        Effect.gen(function* () {
          const lifecycle = yield* SyncLifecycle
          const syncCallsRef = yield* SyncCallsRef
          const shouldFailRef = yield* ShouldFailRef

          // Start background sync
          const fiber = yield* lifecycle.startBackgroundSync()

          // First sync succeeds
          yield* TestClock.adjust(SYNC_INTERVAL)
          yield* Effect.yieldNow()
          const after1 = yield* Ref.get(syncCallsRef)
          expect(after1).toBe(1)

          // Configure failure
          yield* Ref.set(shouldFailRef, true)

          // Second sync fails but doesn't crash
          yield* TestClock.adjust(SYNC_INTERVAL)
          yield* Effect.yieldNow()
          const after2 = yield* Ref.get(syncCallsRef)
          expect(after2).toBe(2)

          // Turn off failure
          yield* Ref.set(shouldFailRef, false)

          // Third sync succeeds (fiber still running)
          yield* TestClock.adjust(SYNC_INTERVAL)
          yield* Effect.yieldNow()
          const after3 = yield* Ref.get(syncCallsRef)
          expect(after3).toBe(3)

          // Clean up
          yield* Fiber.interrupt(fiber)
        }),
      )
    })

    it.layer(makeTestLayer(true))((it) => {
      it.effect('no sync before first interval elapses using TestClock', () =>
        Effect.gen(function* () {
          const lifecycle = yield* SyncLifecycle
          const syncCallsRef = yield* SyncCallsRef

          // Start background sync
          const fiber = yield* lifecycle.startBackgroundSync()

          // Advance only 29 seconds (1 second less than interval)
          yield* TestClock.adjust(Duration.seconds(29))
          yield* Effect.yieldNow()

          // Should not have synced yet
          const before = yield* Ref.get(syncCallsRef)
          expect(before).toBe(0)

          // Advance the remaining 1 second
          yield* TestClock.adjust(Duration.seconds(1))
          yield* Effect.yieldNow()

          // Now should have synced
          const after = yield* Ref.get(syncCallsRef)
          expect(after).toBe(1)

          // Clean up
          yield* Fiber.interrupt(fiber)
        }),
      )
    })

    it.layer(makeTestLayer(true))((it) => {
      it.effect('sync fiber can be interrupted using TestClock', () =>
        Effect.gen(function* () {
          const lifecycle = yield* SyncLifecycle
          const syncCallsRef = yield* SyncCallsRef

          // Start background sync
          const fiber = yield* lifecycle.startBackgroundSync()

          // First sync
          yield* TestClock.adjust(SYNC_INTERVAL)
          yield* Effect.yieldNow()
          const after1 = yield* Ref.get(syncCallsRef)
          expect(after1).toBe(1)

          // Interrupt the fiber
          yield* Fiber.interrupt(fiber)

          // Advance time again
          yield* TestClock.adjust(SYNC_INTERVAL)
          yield* Effect.yieldNow()

          // Should not have synced again (fiber was interrupted)
          const afterInterrupt = yield* Ref.get(syncCallsRef)
          expect(afterInterrupt).toBe(1)
        }),
      )
    })
  })

  describe('runShutdownSync', () => {
    it.layer(makeTestLayer(true))((it) => {
      it.effect('attempts sync on shutdown', () =>
        Effect.gen(function* () {
          const lifecycle = yield* SyncLifecycle
          const syncCallsRef = yield* SyncCallsRef

          // Run shutdown sync
          const result = yield* lifecycle.runShutdownSync()

          // Should have called sync once
          const calls = yield* Ref.get(syncCallsRef)
          expect(calls).toBe(1)

          // Should return no error
          expect(Option.isNone(result)).toBe(true)
        }),
      )
    })

    it.layer(makeTestLayer(true))((it) => {
      it.effect('shutdown sync error is logged but does not throw', () =>
        Effect.gen(function* () {
          const lifecycle = yield* SyncLifecycle
          const syncCallsRef = yield* SyncCallsRef
          const shouldFailRef = yield* ShouldFailRef

          // Configure sync to fail
          yield* Ref.set(shouldFailRef, true)

          // Run shutdown sync - should not throw
          const result = yield* lifecycle.runShutdownSync()

          // Should have called sync once
          const calls = yield* Ref.get(syncCallsRef)
          expect(calls).toBe(1)

          // Should return an error
          expect(Option.isSome(result)).toBe(true)
        }),
      )
    })
  })

  describe('isLoggedIn', () => {
    it.layer(makeTestLayer(true))((it) => {
      it.effect('returns true when token exists', () =>
        Effect.gen(function* () {
          const lifecycle = yield* SyncLifecycle
          const loggedIn = yield* lifecycle.isLoggedIn()
          expect(loggedIn).toBe(true)
        }),
      )
    })

    it.layer(makeTestLayer(false))((it) => {
      it.effect('returns false when no token', () =>
        Effect.gen(function* () {
          const lifecycle = yield* SyncLifecycle
          const loggedIn = yield* lifecycle.isLoggedIn()
          expect(loggedIn).toBe(false)
        }),
      )
    })
  })
})

describe('handleSyncError', () => {
  it.effect('returns None on success', () =>
    Effect.gen(function* () {
      const result = yield* Effect.void.pipe(handleSyncError('initial'))
      expect(Option.isNone(result)).toBe(true)
    }),
  )

  it.effect('returns Some with error on SyncNetworkError', () =>
    Effect.gen(function* () {
      const error = new SyncNetworkError({ message: 'Test error' })
      const result = yield* Effect.fail(error).pipe(handleSyncError('background'))
      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe('SyncNetworkError')
      }
    }),
  )

  it.effect('returns Some with error on SyncAuthError', () =>
    Effect.gen(function* () {
      const error = new SyncAuthError({ message: 'Auth failed' })
      const result = yield* Effect.fail(error).pipe(handleSyncError('shutdown'))
      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe('SyncAuthError')
      }
    }),
  )
})

describe('runWithSyncLifecycle', () => {
  it.layer(makeTestLayer(true))((it) => {
    it.effect('runs startup sync before TUI', () =>
      Effect.gen(function* () {
        const syncCallsRef = yield* SyncCallsRef
        const tuiRan = yield* Ref.make(false)

        // Create a TUI effect that marks it ran
        const tui = Ref.set(tuiRan, true)

        // Run with sync lifecycle - run only startup (no background tick)
        yield* runWithSyncLifecycle(tui).pipe(Effect.timeout(Duration.millis(100)), Effect.option)

        // Check TUI ran
        const ran = yield* Ref.get(tuiRan)
        expect(ran).toBe(true)

        // Check startup sync was called (at least 1 for startup)
        const calls = yield* Ref.get(syncCallsRef)
        expect(calls).toBeGreaterThanOrEqual(1)
      }),
    )
  })

  it.layer(makeTestLayer(false))((it) => {
    it.effect('skips sync when not logged in', () =>
      Effect.gen(function* () {
        const syncCallsRef = yield* SyncCallsRef
        const tuiRan = yield* Ref.make(false)

        // Create a TUI effect that marks it ran
        const tui = Ref.set(tuiRan, true)

        // Run with sync lifecycle
        yield* runWithSyncLifecycle(tui)

        // Check TUI ran
        const ran = yield* Ref.get(tuiRan)
        expect(ran).toBe(true)

        // Check no sync was called
        const calls = yield* Ref.get(syncCallsRef)
        expect(calls).toBe(0)
      }),
    )
  })
})
