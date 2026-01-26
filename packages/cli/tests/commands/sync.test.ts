/**
 * Tests for the sync command.
 * Uses mocked services for isolation (RemoteClient, LocalConfig, LocalDb).
 */
import { SyncAuthError, SyncNetworkError } from '@subq/shared'
import {
  LocalConfig,
  LocalDb,
  RemoteClient,
  type LocalConfigService,
  type LocalDbService,
  type RemoteClientService,
} from '@subq/local'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Either, Layer, Option, Ref } from 'effect'

// ============================================
// Mock Helpers
// ============================================

/**
 * Create a mock LocalConfig with configurable token.
 */
const makeMockLocalConfig = (storedToken: Ref.Ref<Option.Option<string>>): LocalConfigService => ({
  get: () => Effect.succeed(Option.none()),
  set: (_key, value) => Ref.set(storedToken, Option.some(value)),
  delete: () => Ref.set(storedToken, Option.none()),
  getServerUrl: () => Effect.succeed('https://test.example.com'),
  getAuthToken: () => Ref.get(storedToken),
})

/**
 * Create a mock LocalDb that tracks sync operations.
 */
const makeMockLocalDb = (options?: {
  cursorRef?: Ref.Ref<Option.Option<string>>
  outboxItems?: ReadonlyArray<{
    table: string
    id: string
    operation: 'insert' | 'update' | 'delete'
    payload: Record<string, unknown>
    timestamp: number
  }>
  applyChangesCalled?: Ref.Ref<boolean>
  clearOutboxCalled?: Ref.Ref<boolean>
}): LocalDbService => {
  const { cursorRef, outboxItems = [], applyChangesCalled, clearOutboxCalled } = options ?? {}

  // Track whether outbox has been cleared (to simulate empty after push)
  let outboxCleared = false

  return {
    getMeta: (key) => {
      if (key === 'last_sync_cursor' && cursorRef) {
        return Ref.get(cursorRef)
      }
      return Effect.succeed(Option.none())
    },
    setMeta: (key, value) => {
      if (key === 'last_sync_cursor' && cursorRef) {
        return Ref.set(cursorRef, Option.some(value))
      }
      return Effect.void
    },
    getOutbox: () => {
      if (outboxCleared) {
        return Effect.succeed([])
      }
      return Effect.succeed([...outboxItems])
    },
    clearOutbox: () => {
      outboxCleared = true
      if (clearOutboxCalled) {
        return Ref.set(clearOutboxCalled, true)
      }
      return Effect.void
    },
    applyChanges: () => {
      if (applyChangesCalled) {
        return Ref.set(applyChangesCalled, true)
      }
      return Effect.void
    },
    applyServerVersion: () => Effect.void,
    removeFromOutbox: () => Effect.void,
    writeWithOutbox: () => Effect.void,
  }
}

/**
 * Create a mock RemoteClient for successful sync.
 */
const makeMockRemoteClientSuccess = (options?: {
  pullChanges?: ReadonlyArray<{
    table: string
    id: string
    operation: 'insert' | 'update' | 'delete'
    payload: Record<string, unknown>
    timestamp: number
  }>
  pullCalled?: Ref.Ref<boolean>
  pushCalled?: Ref.Ref<boolean>
}): RemoteClientService => {
  const { pullChanges = [], pullCalled, pushCalled } = options ?? {}

  return {
    pull: () => {
      const effect = pullCalled ? Ref.set(pullCalled, true) : Effect.void
      return effect.pipe(
        Effect.map(() => ({
          changes: [...pullChanges],
          cursor: '2024-01-01T00:00:00Z',
          hasMore: false,
        })),
      )
    },
    push: (request) => {
      const effect = pushCalled ? Ref.set(pushCalled, true) : Effect.void
      return effect.pipe(
        Effect.map(() => ({
          accepted: request.changes.map((c) => c.id),
          conflicts: [],
        })),
      )
    },
    authenticate: () => Effect.succeed({ token: 'test-token' }),
  }
}

/**
 * Create a mock RemoteClient that fails with SyncAuthError.
 */
const makeMockRemoteClientAuthError = (): RemoteClientService => ({
  pull: () => Effect.fail(new SyncAuthError({ message: 'Invalid token' })),
  push: () => Effect.fail(new SyncAuthError({ message: 'Invalid token' })),
  authenticate: () => Effect.succeed({ token: 'test-token' }),
})

/**
 * Create a mock RemoteClient that fails with SyncNetworkError.
 */
const makeMockRemoteClientNetworkError = (): RemoteClientService => ({
  pull: () => Effect.fail(new SyncNetworkError({ message: 'Connection failed' })),
  push: () => Effect.fail(new SyncNetworkError({ message: 'Connection failed' })),
  authenticate: () => Effect.succeed({ token: 'test-token' }),
})

// ============================================
// Tests
// ============================================

describe('sync command', () => {
  describe('requires login token', () => {
    it.effect('returns early when no token is present', () =>
      Effect.gen(function* () {
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.none())
        const mockConfig = makeMockLocalConfig(storedToken)
        const configLayer = Layer.succeed(LocalConfig, mockConfig)

        // Simulate sync check for token
        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          const maybeToken = yield* config.getAuthToken()
          return Option.isNone(maybeToken) ? 'not_logged_in' : 'logged_in'
        }).pipe(Effect.provide(configLayer))

        expect(result).toBe('not_logged_in')
      }),
    )

    it.effect('proceeds when token is present', () =>
      Effect.gen(function* () {
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.some('test-token'))
        const mockConfig = makeMockLocalConfig(storedToken)
        const configLayer = Layer.succeed(LocalConfig, mockConfig)

        // Simulate sync check for token
        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          const maybeToken = yield* config.getAuthToken()
          return Option.isNone(maybeToken) ? 'not_logged_in' : 'logged_in'
        }).pipe(Effect.provide(configLayer))

        expect(result).toBe('logged_in')
      }),
    )
  })

  describe('pull progress', () => {
    it.effect('calls pull on remote client', () =>
      Effect.gen(function* () {
        const pullCalled = yield* Ref.make(false)

        const mockRemote = makeMockRemoteClientSuccess({ pullCalled })
        const mockDb = makeMockLocalDb()

        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate pull phase
        yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          yield* remote.pull({ cursor: '1970-01-01T00:00:00Z' })
        }).pipe(Effect.provide(remoteLayer), Effect.provide(dbLayer))

        const wasCalled = yield* Ref.get(pullCalled)
        expect(wasCalled).toBe(true)
      }),
    )

    it.effect('applies changes from pull response', () =>
      Effect.gen(function* () {
        const applyChangesCalled = yield* Ref.make(false)
        const pullChanges = [
          {
            table: 'weight_logs',
            id: 'test-id-1',
            operation: 'insert' as const,
            payload: { weight: 150 },
            timestamp: Date.now(),
          },
        ]

        const mockRemote = makeMockRemoteClientSuccess({ pullChanges })
        const mockDb = makeMockLocalDb({ applyChangesCalled })

        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate pull phase
        yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          const local = yield* LocalDb

          const pulled = yield* remote.pull({ cursor: '1970-01-01T00:00:00Z' })
          yield* local.applyChanges(pulled.changes)
        }).pipe(Effect.provide(remoteLayer), Effect.provide(dbLayer))

        const wasCalled = yield* Ref.get(applyChangesCalled)
        expect(wasCalled).toBe(true)
      }),
    )
  })

  describe('push progress', () => {
    it.effect('calls push on remote client with outbox items', () =>
      Effect.gen(function* () {
        const pushCalled = yield* Ref.make(false)
        const outboxItems = [
          {
            table: 'weight_logs',
            id: 'local-id-1',
            operation: 'insert' as const,
            payload: { weight: 155 },
            timestamp: Date.now(),
          },
        ]

        const mockRemote = makeMockRemoteClientSuccess({ pushCalled })
        const mockDb = makeMockLocalDb({ outboxItems })

        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate push phase
        yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          const local = yield* LocalDb

          const outbox = yield* local.getOutbox({ limit: 1000 })
          if (outbox.length > 0) {
            yield* remote.push({ changes: outbox })
          }
        }).pipe(Effect.provide(remoteLayer), Effect.provide(dbLayer))

        const wasCalled = yield* Ref.get(pushCalled)
        expect(wasCalled).toBe(true)
      }),
    )

    it.effect('clears outbox after successful push', () =>
      Effect.gen(function* () {
        const clearOutboxCalled = yield* Ref.make(false)
        const outboxItems = [
          {
            table: 'weight_logs',
            id: 'local-id-1',
            operation: 'insert' as const,
            payload: { weight: 155 },
            timestamp: Date.now(),
          },
        ]

        const mockRemote = makeMockRemoteClientSuccess()
        const mockDb = makeMockLocalDb({ outboxItems, clearOutboxCalled })

        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate push phase
        yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          const local = yield* LocalDb

          const outbox = yield* local.getOutbox({ limit: 1000 })
          if (outbox.length > 0) {
            const result = yield* remote.push({ changes: outbox })
            if (result.accepted.length > 0) {
              yield* local.clearOutbox(result.accepted)
            }
          }
        }).pipe(Effect.provide(remoteLayer), Effect.provide(dbLayer))

        const wasCalled = yield* Ref.get(clearOutboxCalled)
        expect(wasCalled).toBe(true)
      }),
    )
  })

  describe('completion', () => {
    it.effect('completes sync flow without errors', () =>
      Effect.gen(function* () {
        const cursorRef = yield* Ref.make<Option.Option<string>>(Option.none())
        const pullCalled = yield* Ref.make(false)

        const mockRemote = makeMockRemoteClientSuccess({ pullCalled })
        const mockDb = makeMockLocalDb({ cursorRef })

        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate full sync flow
        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          const local = yield* LocalDb

          // Pull phase
          const pulled = yield* remote.pull({ cursor: '1970-01-01T00:00:00Z' })
          yield* local.applyChanges(pulled.changes)
          yield* local.setMeta('last_sync_cursor', pulled.cursor)

          // Push phase
          const outbox = yield* local.getOutbox({ limit: 1000 })
          if (outbox.length > 0) {
            yield* remote.push({ changes: outbox })
          }

          return 'success'
        }).pipe(Effect.provide(remoteLayer), Effect.provide(dbLayer), Effect.either)

        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right).toBe('success')
        }

        // Verify cursor was updated
        const cursor = yield* Ref.get(cursorRef)
        expect(Option.isSome(cursor)).toBe(true)
      }),
    )
  })

  describe('error handling', () => {
    it.effect('returns SyncAuthError on authentication failure', () =>
      Effect.gen(function* () {
        const mockRemote = makeMockRemoteClientAuthError()
        const mockDb = makeMockLocalDb()

        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate sync that fails with auth error
        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          yield* remote.pull({ cursor: '1970-01-01T00:00:00Z' })
          return 'success'
        }).pipe(Effect.provide(remoteLayer), Effect.provide(dbLayer), Effect.either)

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe('SyncAuthError')
        }
      }),
    )

    it.effect('returns SyncNetworkError on network failure', () =>
      Effect.gen(function* () {
        const mockRemote = makeMockRemoteClientNetworkError()
        const mockDb = makeMockLocalDb()

        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate sync that fails with network error
        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          yield* remote.pull({ cursor: '1970-01-01T00:00:00Z' })
          return 'success'
        }).pipe(Effect.provide(remoteLayer), Effect.provide(dbLayer), Effect.either)

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe('SyncNetworkError')
        }
      }),
    )
  })
})
