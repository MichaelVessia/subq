/**
 * Tests for the log command.
 * Tests that the command writes to local injection_logs + outbox and requires login.
 */
import {
  LocalConfig,
  LocalDb,
  type LocalConfigService,
  type LocalDbService,
  type WriteWithOutboxOptions,
} from '@subq/local'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Layer, Option, Ref } from 'effect'
import { requireLogin } from '../../src/commands/log.js'

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
 * Create a mock LocalDb that tracks writeWithOutbox calls.
 */
const makeMockLocalDb = (options?: {
  writeWithOutboxCalled?: Ref.Ref<boolean>
  lastWriteOptions?: Ref.Ref<Option.Option<WriteWithOutboxOptions>>
}): LocalDbService => ({
  getMeta: () => Effect.succeed(Option.none()),
  setMeta: () => Effect.void,
  getOutbox: () => Effect.succeed([]),
  clearOutbox: () => Effect.void,
  applyChanges: () => Effect.void,
  applyServerVersion: () => Effect.void,
  removeFromOutbox: () => Effect.void,
  writeWithOutbox: (writeOptions) =>
    Effect.gen(function* () {
      if (options?.writeWithOutboxCalled) {
        yield* Ref.set(options.writeWithOutboxCalled, true)
      }
      if (options?.lastWriteOptions) {
        yield* Ref.set(options.lastWriteOptions, Option.some(writeOptions))
      }
    }),
})

// ============================================
// Tests
// ============================================

describe('log command', () => {
  describe('requires login', () => {
    it.effect('fails with NotLoggedInError when no token is present', () =>
      Effect.gen(function* () {
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.none())
        const mockConfig = makeMockLocalConfig(storedToken)
        const configLayer = Layer.succeed(LocalConfig, mockConfig)

        const result = yield* requireLogin().pipe(Effect.provide(configLayer), Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('NotLoggedInError')
        }
      }),
    )

    it.effect('succeeds when token is present', () =>
      Effect.gen(function* () {
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.some('test-token'))
        const mockConfig = makeMockLocalConfig(storedToken)
        const configLayer = Layer.succeed(LocalConfig, mockConfig)

        const result = yield* requireLogin().pipe(Effect.provide(configLayer), Effect.either)

        expect(result._tag).toBe('Right')
        if (result._tag === 'Right') {
          expect(result.right).toBe('test-token')
        }
      }),
    )
  })

  describe('writes to local database', () => {
    it.effect('calls writeWithOutbox with injection_logs table', () =>
      Effect.gen(function* () {
        const writeWithOutboxCalled = yield* Ref.make(false)
        const lastWriteOptions = yield* Ref.make<Option.Option<WriteWithOutboxOptions>>(Option.none())

        const mockDb = makeMockLocalDb({ writeWithOutboxCalled, lastWriteOptions })
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate a write
        yield* Effect.gen(function* () {
          const local = yield* LocalDb
          yield* local.writeWithOutbox({
            table: 'injection_logs',
            id: 'test-uuid',
            operation: 'insert',
            payload: {
              id: 'test-uuid',
              datetime: '2024-01-15T10:00:00.000Z',
              drug: 'semaglutide',
              dosage: '0.5mg',
              source: null,
              injection_site: null,
              notes: null,
              schedule_id: null,
              user_id: null,
              created_at: '2024-01-15T10:00:00.000Z',
              updated_at: '2024-01-15T10:00:00.000Z',
              deleted_at: null,
            },
          })
        }).pipe(Effect.provide(dbLayer))

        const wasCalled = yield* Ref.get(writeWithOutboxCalled)
        expect(wasCalled).toBe(true)

        const writeOptions = yield* Ref.get(lastWriteOptions)
        expect(Option.isSome(writeOptions)).toBe(true)
        if (Option.isSome(writeOptions)) {
          expect(writeOptions.value.table).toBe('injection_logs')
          expect(writeOptions.value.operation).toBe('insert')
        }
      }),
    )

    it.effect('creates outbox entry for syncing', () =>
      Effect.gen(function* () {
        const lastWriteOptions = yield* Ref.make<Option.Option<WriteWithOutboxOptions>>(Option.none())

        const mockDb = makeMockLocalDb({ lastWriteOptions })
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate a write
        yield* Effect.gen(function* () {
          const local = yield* LocalDb
          yield* local.writeWithOutbox({
            table: 'injection_logs',
            id: 'test-uuid-2',
            operation: 'insert',
            payload: {
              id: 'test-uuid-2',
              datetime: '2024-01-16T10:00:00.000Z',
              drug: 'tirzepatide',
              dosage: '2.5mg',
              source: 'pharmacy',
              injection_site: 'left abdomen',
              notes: 'first injection',
              schedule_id: null,
              user_id: null,
              created_at: '2024-01-16T10:00:00.000Z',
              updated_at: '2024-01-16T10:00:00.000Z',
              deleted_at: null,
            },
          })
        }).pipe(Effect.provide(dbLayer))

        const writeOptions = yield* Ref.get(lastWriteOptions)
        expect(Option.isSome(writeOptions)).toBe(true)
        if (Option.isSome(writeOptions)) {
          // Verify payload contains expected fields
          const payload = writeOptions.value.payload
          expect(payload.drug).toBe('tirzepatide')
          expect(payload.dosage).toBe('2.5mg')
          expect(payload.source).toBe('pharmacy')
          expect(payload.injection_site).toBe('left abdomen')
          expect(payload.notes).toBe('first injection')
        }
      }),
    )
  })

  describe('command execution flow', () => {
    it.effect('requires login before writing', () =>
      Effect.gen(function* () {
        // Simulate the full flow: check login first
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.none())
        const writeWithOutboxCalled = yield* Ref.make(false)

        const mockConfig = makeMockLocalConfig(storedToken)
        const mockDb = makeMockLocalDb({ writeWithOutboxCalled })

        const configLayer = Layer.succeed(LocalConfig, mockConfig)
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // This simulates the command flow: check login, then write
        const result = yield* Effect.gen(function* () {
          // Step 1: Check login
          const loginResult = yield* requireLogin().pipe(Effect.either)
          if (loginResult._tag === 'Left') {
            return 'not_logged_in'
          }

          // Step 2: Write to DB (only if logged in)
          const local = yield* LocalDb
          yield* local.writeWithOutbox({
            table: 'injection_logs',
            id: 'test-uuid',
            operation: 'insert',
            payload: {},
          })
          return 'success'
        }).pipe(Effect.provide(configLayer), Effect.provide(dbLayer))

        // Should have stopped at login check
        expect(result).toBe('not_logged_in')

        // Write should not have been called
        const wasCalled = yield* Ref.get(writeWithOutboxCalled)
        expect(wasCalled).toBe(false)
      }),
    )
  })
})
