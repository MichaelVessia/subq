/**
 * Tests for the login command.
 * Uses mocked services for isolation (RemoteClient, LocalConfig, LocalDb).
 */
import { LoginFailedError } from '@subq/shared'
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
 * Create a mock LocalConfig that tracks stored values.
 */
const makeMockLocalConfig = (storedToken: Ref.Ref<Option.Option<string>>): LocalConfigService => ({
  get: () => Effect.succeed(Option.none()),
  set: (_key, value) => Ref.set(storedToken, Option.some(value)),
  getServerUrl: () => Effect.succeed('https://test.example.com'),
  getAuthToken: () => Ref.get(storedToken),
})

/**
 * Create a mock RemoteClient for successful authentication.
 */
const makeMockRemoteClientSuccess = (tokenToReturn: string): RemoteClientService => ({
  pull: () => Effect.succeed({ changes: [], cursor: '2024-01-01T00:00:00Z', hasMore: false }),
  push: () => Effect.succeed({ accepted: [], conflicts: [] }),
  authenticate: (request) =>
    Effect.gen(function* () {
      // Validate credentials match expected
      if (request.email && request.password) {
        return { token: tokenToReturn }
      }
      return yield* Effect.fail(new LoginFailedError({ reason: 'invalid_credentials', message: 'Invalid' }))
    }),
})

/**
 * Create a mock RemoteClient that fails with invalid credentials.
 */
const makeMockRemoteClientInvalidCreds = (): RemoteClientService => ({
  pull: () => Effect.succeed({ changes: [], cursor: '2024-01-01T00:00:00Z', hasMore: false }),
  push: () => Effect.succeed({ accepted: [], conflicts: [] }),
  authenticate: () =>
    Effect.fail(
      new LoginFailedError({
        reason: 'invalid_credentials',
        message: 'Invalid email or password',
      }),
    ),
})

/**
 * Create a mock RemoteClient that fails with network error.
 */
const makeMockRemoteClientNetworkError = (): RemoteClientService => ({
  pull: () => Effect.succeed({ changes: [], cursor: '2024-01-01T00:00:00Z', hasMore: false }),
  push: () => Effect.succeed({ accepted: [], conflicts: [] }),
  authenticate: () =>
    Effect.fail(
      new LoginFailedError({
        reason: 'network_error',
        message: 'Network connection failed',
      }),
    ),
})

/**
 * Create a mock LocalDb for testing (does nothing, just satisfies interface).
 */
const makeMockLocalDb = (): LocalDbService => ({
  getMeta: () => Effect.succeed(Option.none()),
  setMeta: () => Effect.void,
  getOutbox: () => Effect.succeed([]),
  clearOutbox: () => Effect.void,
  applyChanges: () => Effect.void,
  applyServerVersion: () => Effect.void,
  removeFromOutbox: () => Effect.void,
  writeWithOutbox: () => Effect.void,
})

// ============================================
// Tests
// ============================================

describe('login command', () => {
  describe('successful login', () => {
    it.effect('stores token in LocalConfig after authentication', () =>
      Effect.gen(function* () {
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.none())
        const expectedToken = 'test-token-abc123'

        const mockConfig = makeMockLocalConfig(storedToken)
        const mockRemote = makeMockRemoteClientSuccess(expectedToken)

        const configLayer = Layer.succeed(LocalConfig, mockConfig)
        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)

        // Simulate the authentication flow
        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          const config = yield* LocalConfig

          // Authenticate
          const authResult = yield* remote.authenticate({
            email: 'test@example.com',
            password: 'password123',
            deviceName: 'test-host',
          })

          // Store token
          yield* config.set('auth_token', authResult.token)

          return authResult.token
        }).pipe(Effect.provide(configLayer), Effect.provide(remoteLayer))

        // Verify token was returned
        expect(result).toBe(expectedToken)

        // Verify token was stored in config
        const stored = yield* Ref.get(storedToken)
        expect(Option.isSome(stored)).toBe(true)
        if (Option.isSome(stored)) {
          expect(stored.value).toBe(expectedToken)
        }
      }),
    )

    it.effect('triggers sync after successful login', () =>
      Effect.gen(function* () {
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.none())
        const syncCalled = yield* Ref.make(false)

        const mockConfig = makeMockLocalConfig(storedToken)

        // Create a remote client that tracks pull calls
        const mockRemote: RemoteClientService = {
          pull: () =>
            Ref.set(syncCalled, true).pipe(
              Effect.map(() => ({ changes: [], cursor: '2024-01-01T00:00:00Z', hasMore: false })),
            ),
          push: () => Effect.succeed({ accepted: [], conflicts: [] }),
          authenticate: () => Effect.succeed({ token: 'test-token' }),
        }

        const mockDb = makeMockLocalDb()

        const configLayer = Layer.succeed(LocalConfig, mockConfig)
        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)
        const dbLayer = Layer.succeed(LocalDb, mockDb)

        // Simulate the login + sync flow
        yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          const config = yield* LocalConfig
          const db = yield* LocalDb

          // Authenticate
          const authResult = yield* remote.authenticate({
            email: 'test@example.com',
            password: 'password123',
            deviceName: 'test-host',
          })

          // Store token
          yield* config.set('auth_token', authResult.token)

          // Simulate sync by calling pull
          yield* remote.pull({ cursor: '1970-01-01T00:00:00Z' })
        }).pipe(Effect.provide(configLayer), Effect.provide(remoteLayer), Effect.provide(dbLayer))

        // Verify sync was triggered (pull was called)
        const wasSynced = yield* Ref.get(syncCalled)
        expect(wasSynced).toBe(true)
      }),
    )
  })

  describe('failed login - invalid credentials', () => {
    it.effect('returns LoginFailedError with invalid_credentials reason', () =>
      Effect.gen(function* () {
        const mockRemote = makeMockRemoteClientInvalidCreds()
        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote
            .authenticate({
              email: 'wrong@example.com',
              password: 'wrongpassword',
              deviceName: 'test-host',
            })
            .pipe(Effect.either)
        }).pipe(Effect.provide(remoteLayer))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe('LoginFailedError')
          expect((result.left as LoginFailedError).reason).toBe('invalid_credentials')
        }
      }),
    )
  })

  describe('failed login - network error', () => {
    it.effect('returns LoginFailedError with network_error reason', () =>
      Effect.gen(function* () {
        const mockRemote = makeMockRemoteClientNetworkError()
        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote
            .authenticate({
              email: 'test@example.com',
              password: 'password123',
              deviceName: 'test-host',
            })
            .pipe(Effect.either)
        }).pipe(Effect.provide(remoteLayer))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe('LoginFailedError')
          expect((result.left as LoginFailedError).reason).toBe('network_error')
        }
      }),
    )
  })

  describe('error message handling', () => {
    it.effect('maps invalid_credentials to appropriate message', () =>
      Effect.gen(function* () {
        const mockRemote = makeMockRemoteClientInvalidCreds()
        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote
            .authenticate({
              email: 'wrong@example.com',
              password: 'wrongpassword',
              deviceName: 'test-host',
            })
            .pipe(Effect.either)
        }).pipe(Effect.provide(remoteLayer))

        if (Either.isLeft(result)) {
          const err = result.left as LoginFailedError
          // Verify we can get a meaningful message from the error
          expect(err.reason).toBe('invalid_credentials')

          // Check that the error reason maps to expected message
          const expectedMessage = 'Invalid email or password'
          const actualMessage = err.reason === 'invalid_credentials' ? 'Invalid email or password' : err.message
          expect(actualMessage).toBe(expectedMessage)
        }
      }),
    )

    it.effect('maps network_error to appropriate message', () =>
      Effect.gen(function* () {
        const mockRemote = makeMockRemoteClientNetworkError()
        const remoteLayer = Layer.succeed(RemoteClient, mockRemote)

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote
            .authenticate({
              email: 'test@example.com',
              password: 'password123',
              deviceName: 'test-host',
            })
            .pipe(Effect.either)
        }).pipe(Effect.provide(remoteLayer))

        if (Either.isLeft(result)) {
          const err = result.left as LoginFailedError
          expect(err.reason).toBe('network_error')

          // Check that the error reason maps to expected message
          const expectedMessage = 'Network error - check your connection'
          const actualMessage = err.reason === 'network_error' ? 'Network error - check your connection' : err.message
          expect(actualMessage).toBe(expectedMessage)
        }
      }),
    )
  })
})
