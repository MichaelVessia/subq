/**
 * Tests for RemoteClient service.
 * Uses mocked HttpClient layer for test isolation.
 */
import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { FileSystem, Path } from '@effect/platform'
import { LoginFailedError, SyncAuthError, SyncNetworkError } from '@subq/shared'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Either, Layer, Option, Ref } from 'effect'
import { LocalConfig } from '../src/services/LocalConfig.js'
import { RemoteClient } from '../src/services/RemoteClient.js'

// ============================================
// Test Helpers
// ============================================

/**
 * Creates a mock LocalConfig layer for testing.
 */
const makeTestConfigLayer = (options: { serverUrl: string; authToken: Option.Option<string> }) =>
  Layer.succeed(LocalConfig, {
    get: () => Effect.succeed(Option.none()),
    set: () => Effect.void,
    getServerUrl: () => Effect.succeed(options.serverUrl),
    getAuthToken: () => Effect.succeed(options.authToken),
  })

/**
 * Creates a mock HttpClient that returns a successful JSON response.
 */
const makeJsonResponseClient = (responseBody: unknown, status = 200) =>
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(responseBody), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  )

/**
 * Creates a mock HttpClient that returns an error response.
 */
const makeErrorResponseClient = (status: number, body = '{}') =>
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(body, {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  )

/**
 * Creates a mock HttpClient that captures requests and returns a configurable response.
 */
const makeCapturingClient = (
  capturedRequests: Ref.Ref<Array<HttpClientRequest.HttpClientRequest>>,
  responseBody: unknown,
  status = 200,
) =>
  HttpClient.make((request) =>
    Ref.update(capturedRequests, (reqs) => [...reqs, request]).pipe(
      Effect.map(() =>
        HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(responseBody), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    ),
  )

/**
 * Creates a mock HttpClient that simulates a network failure.
 */
const makeNetworkFailureClient = () =>
  HttpClient.make((request) =>
    Effect.fail(
      new (class extends Error {
        readonly _tag = 'RequestError' as const
        readonly message = 'Network connection failed'
        readonly request = request
        readonly reason = 'Transport' as const
      })(),
    ),
  )

// ============================================
// Tests
// ============================================

describe('RemoteClient', () => {
  describe('pull', () => {
    it.effect('sends correct request format', () =>
      Effect.gen(function* () {
        const capturedRequests = yield* Ref.make<Array<HttpClientRequest.HttpClientRequest>>([])

        const pullResponse = {
          changes: [],
          cursor: '2024-01-15T10:30:00Z',
          hasMore: false,
        }

        const configLayer = makeTestConfigLayer({
          serverUrl: 'https://test.example.com',
          authToken: Option.some('test-token-123'),
        })

        const httpClientLayer = Layer.succeed(
          HttpClient.HttpClient,
          makeCapturingClient(capturedRequests, pullResponse),
        )

        const testLayer = RemoteClient.layer.pipe(Layer.provide(configLayer), Layer.provide(httpClientLayer))

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote.pull({ cursor: '2024-01-01T00:00:00Z', limit: 100 })
        }).pipe(Effect.provide(testLayer))

        // Verify response
        expect(result.changes).toEqual([])
        expect(result.cursor).toBe('2024-01-15T10:30:00Z')
        expect(result.hasMore).toBe(false)

        // Verify request was sent correctly
        const requests = yield* Ref.get(capturedRequests)
        expect(requests.length).toBe(1)
        expect(requests[0].method).toBe('POST')
        expect(requests[0].url).toBe('https://test.example.com/sync/pull')
        expect(requests[0].headers.authorization).toBe('Bearer test-token-123')
      }),
    )

    it.effect('maps 401 response to SyncAuthError', () =>
      Effect.gen(function* () {
        const configLayer = makeTestConfigLayer({
          serverUrl: 'https://test.example.com',
          authToken: Option.some('expired-token'),
        })

        const httpClientLayer = Layer.succeed(HttpClient.HttpClient, makeErrorResponseClient(401))

        const testLayer = RemoteClient.layer.pipe(Layer.provide(configLayer), Layer.provide(httpClientLayer))

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote.pull({ cursor: '2024-01-01T00:00:00Z' }).pipe(Effect.either)
        }).pipe(Effect.provide(testLayer))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe('SyncAuthError')
        }
      }),
    )

    it.effect('maps HTTP error to SyncNetworkError', () =>
      Effect.gen(function* () {
        const configLayer = makeTestConfigLayer({
          serverUrl: 'https://test.example.com',
          authToken: Option.some('valid-token'),
        })

        const httpClientLayer = Layer.succeed(HttpClient.HttpClient, makeErrorResponseClient(500))

        const testLayer = RemoteClient.layer.pipe(Layer.provide(configLayer), Layer.provide(httpClientLayer))

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote.pull({ cursor: '2024-01-01T00:00:00Z' }).pipe(Effect.either)
        }).pipe(Effect.provide(testLayer))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe('SyncNetworkError')
        }
      }),
    )
  })

  describe('push', () => {
    it.effect('sends correct request format', () =>
      Effect.gen(function* () {
        const capturedRequests = yield* Ref.make<Array<HttpClientRequest.HttpClientRequest>>([])

        const pushResponse = {
          accepted: ['row-1', 'row-2'],
          conflicts: [],
        }

        const configLayer = makeTestConfigLayer({
          serverUrl: 'https://test.example.com',
          authToken: Option.some('push-token'),
        })

        const httpClientLayer = Layer.succeed(
          HttpClient.HttpClient,
          makeCapturingClient(capturedRequests, pushResponse),
        )

        const testLayer = RemoteClient.layer.pipe(Layer.provide(configLayer), Layer.provide(httpClientLayer))

        const changes = [
          {
            table: 'weight_logs',
            id: 'row-1',
            operation: 'insert' as const,
            payload: { weight: 150.5 },
            timestamp: 1705316400000,
          },
          {
            table: 'weight_logs',
            id: 'row-2',
            operation: 'update' as const,
            payload: { weight: 151.0 },
            timestamp: 1705316500000,
          },
        ]

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote.push({ changes })
        }).pipe(Effect.provide(testLayer))

        // Verify response
        expect(result.accepted).toEqual(['row-1', 'row-2'])
        expect(result.conflicts).toEqual([])

        // Verify request was sent correctly
        const requests = yield* Ref.get(capturedRequests)
        expect(requests.length).toBe(1)
        expect(requests[0].method).toBe('POST')
        expect(requests[0].url).toBe('https://test.example.com/sync/push')
        expect(requests[0].headers.authorization).toBe('Bearer push-token')
      }),
    )

    it.effect('maps 401 response to SyncAuthError', () =>
      Effect.gen(function* () {
        const configLayer = makeTestConfigLayer({
          serverUrl: 'https://test.example.com',
          authToken: Option.some('expired-token'),
        })

        const httpClientLayer = Layer.succeed(HttpClient.HttpClient, makeErrorResponseClient(401))

        const testLayer = RemoteClient.layer.pipe(Layer.provide(configLayer), Layer.provide(httpClientLayer))

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote.push({ changes: [] }).pipe(Effect.either)
        }).pipe(Effect.provide(testLayer))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe('SyncAuthError')
        }
      }),
    )
  })

  describe('authenticate', () => {
    it.effect('sends credentials and receives token', () =>
      Effect.gen(function* () {
        const capturedRequests = yield* Ref.make<Array<HttpClientRequest.HttpClientRequest>>([])

        const authResponse = {
          token: 'new-cli-token-xyz',
        }

        const configLayer = makeTestConfigLayer({
          serverUrl: 'https://test.example.com',
          authToken: Option.none(),
        })

        const httpClientLayer = Layer.succeed(
          HttpClient.HttpClient,
          makeCapturingClient(capturedRequests, authResponse),
        )

        const testLayer = RemoteClient.layer.pipe(Layer.provide(configLayer), Layer.provide(httpClientLayer))

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote.authenticate({
            email: 'test@example.com',
            password: 'secret123',
            deviceName: 'test-device',
          })
        }).pipe(Effect.provide(testLayer))

        // Verify response
        expect(result.token).toBe('new-cli-token-xyz')

        // Verify request was sent correctly
        const requests = yield* Ref.get(capturedRequests)
        expect(requests.length).toBe(1)
        expect(requests[0].method).toBe('POST')
        expect(requests[0].url).toBe('https://test.example.com/sync/authenticate')
      }),
    )

    it.effect('maps 401 to LoginFailedError with invalid_credentials', () =>
      Effect.gen(function* () {
        const configLayer = makeTestConfigLayer({
          serverUrl: 'https://test.example.com',
          authToken: Option.none(),
        })

        const httpClientLayer = Layer.succeed(HttpClient.HttpClient, makeErrorResponseClient(401))

        const testLayer = RemoteClient.layer.pipe(Layer.provide(configLayer), Layer.provide(httpClientLayer))

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote
            .authenticate({
              email: 'test@example.com',
              password: 'wrong-password',
              deviceName: 'test-device',
            })
            .pipe(Effect.either)
        }).pipe(Effect.provide(testLayer))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe('LoginFailedError')
          expect((result.left as LoginFailedError).reason).toBe('invalid_credentials')
        }
      }),
    )

    it.effect('maps 423 to LoginFailedError with account_locked', () =>
      Effect.gen(function* () {
        const configLayer = makeTestConfigLayer({
          serverUrl: 'https://test.example.com',
          authToken: Option.none(),
        })

        const httpClientLayer = Layer.succeed(HttpClient.HttpClient, makeErrorResponseClient(423))

        const testLayer = RemoteClient.layer.pipe(Layer.provide(configLayer), Layer.provide(httpClientLayer))

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote
            .authenticate({
              email: 'test@example.com',
              password: 'password',
              deviceName: 'test-device',
            })
            .pipe(Effect.either)
        }).pipe(Effect.provide(testLayer))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe('LoginFailedError')
          expect((result.left as LoginFailedError).reason).toBe('account_locked')
        }
      }),
    )
  })

  describe('error handling', () => {
    it.effect('maps network failure to appropriate error', () =>
      Effect.gen(function* () {
        const configLayer = makeTestConfigLayer({
          serverUrl: 'https://unreachable.example.com',
          authToken: Option.some('token'),
        })

        const httpClientLayer = Layer.succeed(HttpClient.HttpClient, makeNetworkFailureClient())

        const testLayer = RemoteClient.layer.pipe(Layer.provide(configLayer), Layer.provide(httpClientLayer))

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote.pull({ cursor: '2024-01-01T00:00:00Z' }).pipe(Effect.either)
        }).pipe(Effect.provide(testLayer))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          // Network failures map to SyncNetworkError
          expect(result.left._tag).toBe('SyncNetworkError')
        }
      }),
    )

    it.effect('maps invalid JSON response to SyncNetworkError', () =>
      Effect.gen(function* () {
        const configLayer = makeTestConfigLayer({
          serverUrl: 'https://test.example.com',
          authToken: Option.some('token'),
        })

        // Return invalid JSON
        const httpClient = HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response('not valid json', {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }),
            ),
          ),
        )

        const httpClientLayer = Layer.succeed(HttpClient.HttpClient, httpClient)

        const testLayer = RemoteClient.layer.pipe(Layer.provide(configLayer), Layer.provide(httpClientLayer))

        const result = yield* Effect.gen(function* () {
          const remote = yield* RemoteClient
          return yield* remote.pull({ cursor: '2024-01-01T00:00:00Z' }).pipe(Effect.either)
        }).pipe(Effect.provide(testLayer))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe('SyncNetworkError')
          expect((result.left as SyncNetworkError).message).toContain('parse')
        }
      }),
    )
  })
})
