/**
 * RemoteClient service for making RPC calls to server sync endpoints.
 * Uses LocalConfig for auth token and server URL.
 */
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from '@effect/platform'
import {
  AuthRequest,
  AuthResponse,
  LoginFailedError,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncAuthError,
  SyncNetworkError,
} from '@subq/shared'
import { Context, Effect, Layer, Option, Schema } from 'effect'
import { LocalConfig } from './LocalConfig.js'

// ============================================
// Service Interface
// ============================================

export interface RemoteClientService {
  /**
   * Pull changes from the server since the given cursor.
   */
  readonly pull: (
    request: typeof PullRequest.Type,
  ) => Effect.Effect<typeof PullResponse.Type, SyncNetworkError | SyncAuthError>

  /**
   * Push local changes to the server.
   */
  readonly push: (
    request: typeof PushRequest.Type,
  ) => Effect.Effect<typeof PushResponse.Type, SyncNetworkError | SyncAuthError>

  /**
   * Authenticate with email/password to obtain a CLI token.
   */
  readonly authenticate: (request: typeof AuthRequest.Type) => Effect.Effect<typeof AuthResponse.Type, LoginFailedError>
}

// ============================================
// Service Tag
// ============================================

export class RemoteClient extends Context.Tag('@subq/local/RemoteClient')<RemoteClient, RemoteClientService>() {
  static readonly layer = Layer.effect(
    RemoteClient,
    Effect.gen(function* () {
      const config = yield* LocalConfig
      const httpClient = yield* HttpClient.HttpClient

      /**
       * Maps HTTP errors to domain-specific sync errors.
       * - 401 -> SyncAuthError
       * - Other HTTP errors -> SyncNetworkError
       */
      const mapHttpErrorToSync = <A, E extends HttpClientError.HttpClientError>(
        effect: Effect.Effect<A, E>,
      ): Effect.Effect<A, SyncNetworkError | SyncAuthError> =>
        effect.pipe(
          Effect.catchAll((error) => {
            // Check if it's a response error with 401 status
            if (error._tag === 'ResponseError' && error.response.status === 401) {
              return Effect.fail(new SyncAuthError({ message: 'Unauthorized: invalid or expired token' }))
            }
            // All other errors become SyncNetworkError
            return Effect.fail(
              new SyncNetworkError({
                message: `Network error: ${error.message}`,
                cause: error,
              }),
            )
          }),
        )

      /**
       * Make a POST request to a sync endpoint with JSON body.
       */
      const postJson = <T, I, R>(
        endpoint: string,
        body: unknown,
        responseSchema: Schema.Schema<T, I, R>,
        authToken: Option.Option<string>,
      ): Effect.Effect<T, SyncNetworkError | SyncAuthError> =>
        Effect.gen(function* () {
          const serverUrl = yield* config.getServerUrl()
          const url = `${serverUrl}${endpoint}`

          // Build request with optional auth header
          const baseRequest = HttpClientRequest.post(url).pipe(HttpClientRequest.bodyJson(body))

          const requestEffect = Option.match(authToken, {
            onNone: () => baseRequest,
            onSome: (token) =>
              baseRequest.pipe(Effect.map(HttpClientRequest.setHeader('Authorization', `Bearer ${token}`))),
          })

          const request = yield* requestEffect

          const response = yield* httpClient.execute(request).pipe(
            Effect.flatMap((res) => {
              // Check for 401 before decoding
              if (res.status === 401) {
                return Effect.fail(
                  new HttpClientError.ResponseError({
                    request,
                    response: res,
                    reason: 'StatusCode',
                    description: 'Unauthorized',
                  }),
                )
              }
              // Check for non-2xx status codes
              if (res.status < 200 || res.status >= 300) {
                return Effect.fail(
                  new HttpClientError.ResponseError({
                    request,
                    response: res,
                    reason: 'StatusCode',
                    description: `HTTP ${res.status}`,
                  }),
                )
              }
              return Effect.succeed(res)
            }),
            mapHttpErrorToSync,
          )

          // Decode response body
          const json = yield* response.json.pipe(
            Effect.mapError(
              (error) =>
                new SyncNetworkError({
                  message: `Failed to parse response: ${error.message}`,
                  cause: error,
                }),
            ),
          )

          const decoded = yield* Schema.decodeUnknown(responseSchema)(json).pipe(
            Effect.mapError(
              (error) =>
                new SyncNetworkError({
                  message: `Invalid response format: ${error.message}`,
                  cause: error,
                }),
            ),
          )

          return decoded
        })

      const pull: RemoteClientService['pull'] = (request) =>
        Effect.gen(function* () {
          const authToken = yield* config.getAuthToken()
          return yield* postJson('/sync/pull', request, PullResponse, authToken)
        })

      const push: RemoteClientService['push'] = (request) =>
        Effect.gen(function* () {
          const authToken = yield* config.getAuthToken()
          return yield* postJson('/sync/push', request, PushResponse, authToken)
        })

      const authenticate: RemoteClientService['authenticate'] = (request) =>
        Effect.gen(function* () {
          const serverUrl = yield* config.getServerUrl()
          const url = `${serverUrl}/sync/authenticate`

          const httpRequest = yield* HttpClientRequest.post(url).pipe(HttpClientRequest.bodyJson(request))

          const response = yield* httpClient.execute(httpRequest).pipe(
            Effect.catchAll((error) => {
              // Network errors become LoginFailedError with network_error reason
              return Effect.fail(
                new LoginFailedError({
                  reason: 'network_error',
                  message: `Network error: ${error.message}`,
                }),
              )
            }),
          )

          // Handle non-2xx responses
          if (response.status === 401 || response.status === 403) {
            return yield* Effect.fail(
              new LoginFailedError({
                reason: 'invalid_credentials',
                message: 'Invalid email or password',
              }),
            )
          }

          if (response.status === 423) {
            return yield* Effect.fail(
              new LoginFailedError({
                reason: 'account_locked',
                message: 'Account is locked',
              }),
            )
          }

          if (response.status < 200 || response.status >= 300) {
            return yield* Effect.fail(
              new LoginFailedError({
                reason: 'network_error',
                message: `Unexpected status: ${response.status}`,
              }),
            )
          }

          // Decode response body
          const json = yield* response.json.pipe(
            Effect.mapError(
              () =>
                new LoginFailedError({
                  reason: 'network_error',
                  message: 'Failed to parse authentication response',
                }),
            ),
          )

          const decoded = yield* Schema.decodeUnknown(AuthResponse)(json).pipe(
            Effect.mapError(
              () =>
                new LoginFailedError({
                  reason: 'network_error',
                  message: 'Invalid authentication response format',
                }),
            ),
          )

          return decoded
        })

      return RemoteClient.of({ pull, push, authenticate })
    }),
  )

  /**
   * Default layer with LocalConfig dependency.
   * Requires HttpClient to be provided separately.
   */
  static readonly Default = RemoteClient.layer.pipe(Layer.provide(LocalConfig.Default))
}
