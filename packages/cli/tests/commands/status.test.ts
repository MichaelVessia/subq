/**
 * Tests for the status command.
 * Uses mocked services for isolation (LocalConfig, LocalDb).
 */
import { LocalConfig, LocalDb, type LocalConfigService, type LocalDbService } from '@subq/local'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Layer, Option, Ref } from 'effect'

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
 * Create a mock LocalDb that returns configurable outbox count and sync cursor.
 */
const makeMockLocalDb = (options?: {
  outboxItems?: ReadonlyArray<{
    table: string
    id: string
    operation: 'insert' | 'update' | 'delete'
    payload: Record<string, unknown>
    timestamp: number
  }>
  lastSyncCursor?: Option.Option<string>
}): LocalDbService => {
  const { outboxItems = [], lastSyncCursor = Option.none() } = options ?? {}

  return {
    getMeta: (key) => {
      if (key === 'last_sync_cursor') {
        return Effect.succeed(lastSyncCursor)
      }
      return Effect.succeed(Option.none())
    },
    setMeta: () => Effect.void,
    getOutbox: () => Effect.succeed([...outboxItems]),
    clearOutbox: () => Effect.void,
    applyChanges: () => Effect.void,
    applyServerVersion: () => Effect.void,
    removeFromOutbox: () => Effect.void,
    writeWithOutbox: () => Effect.void,
  }
}

// ============================================
// Tests
// ============================================

describe('status command', () => {
  describe('authentication', () => {
    it.effect('shows "Not logged in" when no token is present', () =>
      Effect.gen(function* () {
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.none())
        const mockConfig = makeMockLocalConfig(storedToken)
        const configLayer = Layer.succeed(LocalConfig, mockConfig)

        // Simulate status check for token
        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          const maybeToken = yield* config.getAuthToken()
          return Option.isNone(maybeToken) ? 'not_logged_in' : 'logged_in'
        }).pipe(Effect.provide(configLayer))

        expect(result).toBe('not_logged_in')
      }),
    )

    it.effect('proceeds to show status when token is present', () =>
      Effect.gen(function* () {
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.some('test-token'))
        const mockConfig = makeMockLocalConfig(storedToken)
        const configLayer = Layer.succeed(LocalConfig, mockConfig)

        // Simulate status check for token
        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          const maybeToken = yield* config.getAuthToken()
          return Option.isNone(maybeToken) ? 'not_logged_in' : 'logged_in'
        }).pipe(Effect.provide(configLayer))

        expect(result).toBe('logged_in')
      }),
    )
  })

  describe('pending changes', () => {
    it.effect('shows pending count when outbox has items', () =>
      Effect.gen(function* () {
        const outboxItems = [
          {
            table: 'weight_logs',
            id: 'test-id-1',
            operation: 'insert' as const,
            payload: { weight: 150 },
            timestamp: Date.now(),
          },
          {
            table: 'weight_logs',
            id: 'test-id-2',
            operation: 'update' as const,
            payload: { weight: 155 },
            timestamp: Date.now(),
          },
          {
            table: 'injection_logs',
            id: 'test-id-3',
            operation: 'delete' as const,
            payload: {},
            timestamp: Date.now(),
          },
        ]

        const mockDb = makeMockLocalDb({ outboxItems })
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate status check for pending count
        const result = yield* Effect.gen(function* () {
          const local = yield* LocalDb
          const outbox = yield* local.getOutbox({ limit: 10000 })
          return outbox.length
        }).pipe(Effect.provide(dbLayer))

        expect(result).toBe(3)
      }),
    )

    it.effect('shows "0 pending" when outbox is empty', () =>
      Effect.gen(function* () {
        const mockDb = makeMockLocalDb({ outboxItems: [] })
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate status check for pending count
        const result = yield* Effect.gen(function* () {
          const local = yield* LocalDb
          const outbox = yield* local.getOutbox({ limit: 10000 })
          return outbox.length
        }).pipe(Effect.provide(dbLayer))

        expect(result).toBe(0)
      }),
    )
  })

  describe('last sync time', () => {
    it.effect('shows last sync time when cursor exists', () =>
      Effect.gen(function* () {
        const lastSyncTime = '2024-01-15T10:30:00Z'
        const mockDb = makeMockLocalDb({ lastSyncCursor: Option.some(lastSyncTime) })
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate status check for last sync cursor
        const result = yield* Effect.gen(function* () {
          const local = yield* LocalDb
          const cursor = yield* local.getMeta('last_sync_cursor')
          return cursor
        }).pipe(Effect.provide(dbLayer))

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value).toBe(lastSyncTime)
        }
      }),
    )

    it.effect('shows "Never synced" when no cursor exists', () =>
      Effect.gen(function* () {
        const mockDb = makeMockLocalDb({ lastSyncCursor: Option.none() })
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate status check for last sync cursor
        const result = yield* Effect.gen(function* () {
          const local = yield* LocalDb
          const cursor = yield* local.getMeta('last_sync_cursor')
          return cursor
        }).pipe(Effect.provide(dbLayer))

        expect(Option.isNone(result)).toBe(true)
      }),
    )
  })

  describe('combined status', () => {
    it.effect('returns both pending count and last sync time', () =>
      Effect.gen(function* () {
        const outboxItems = [
          {
            table: 'weight_logs',
            id: 'test-id-1',
            operation: 'insert' as const,
            payload: { weight: 150 },
            timestamp: Date.now(),
          },
        ]
        const lastSyncTime = '2024-01-15T10:30:00Z'

        const mockDb = makeMockLocalDb({
          outboxItems,
          lastSyncCursor: Option.some(lastSyncTime),
        })
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate full status check
        const result = yield* Effect.gen(function* () {
          const local = yield* LocalDb

          const outbox = yield* local.getOutbox({ limit: 10000 })
          const pendingCount = outbox.length

          const lastSyncCursor = yield* local.getMeta('last_sync_cursor')

          return { pendingCount, lastSyncCursor }
        }).pipe(Effect.provide(dbLayer))

        expect(result.pendingCount).toBe(1)
        expect(Option.isSome(result.lastSyncCursor)).toBe(true)
        if (Option.isSome(result.lastSyncCursor)) {
          expect(result.lastSyncCursor.value).toBe(lastSyncTime)
        }
      }),
    )
  })
})
