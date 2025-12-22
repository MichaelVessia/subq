import { FetchHttpClient } from '@effect/platform'
import { RpcClient, RpcSerialization } from '@effect/rpc'
import type { RpcClientError } from '@effect/rpc/RpcClientError'
import { AppRpcs, type Unauthorized } from '@subq/shared'
import { Context, Effect, Layer, Option } from 'effect'
import { CliConfigService } from './config.js'
import { Session } from './session.js'

// RPC client type
type AppRpcClient = RpcClient.FromGroup<typeof AppRpcs, RpcClientError>

// Service providing access to RPC calls
export interface ApiClientService {
  readonly call: <A, E>(
    fn: (client: AppRpcClient) => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E | RpcClientError | Unauthorized>
}

export class ApiClient extends Context.Tag('@subq/cli/ApiClient')<ApiClient, ApiClientService>() {
  static readonly layer = Layer.scoped(
    ApiClient,
    Effect.gen(function* () {
      const config = yield* CliConfigService
      const session = yield* Session

      // Get session token if available
      const maybeSession = yield* session.get()
      const authHeaders = Option.match(maybeSession, {
        onNone: () => {
          console.error('[API Client] No session found')
          return {}
        },
        onSome: (s) => {
          // Use Authorization header with Bearer token - works with better-auth's bearer plugin
          console.error(`[API Client] Using Bearer token auth`)
          return { authorization: `Bearer ${s.sessionToken}` }
        },
      })

      // Create RPC client with protocol
      const client = yield* RpcClient.make(AppRpcs).pipe(
        Effect.provide(
          RpcClient.layerProtocolHttp({ url: `${config.apiUrl}/rpc` }).pipe(
            Layer.provide(RpcSerialization.layerNdjson),
            Layer.provide(FetchHttpClient.layer),
          ),
        ),
      )

      const call: ApiClientService['call'] = (fn) => fn(client).pipe(RpcClient.withHeaders(authHeaders))

      return ApiClient.of({ call })
    }),
  ).pipe(Layer.provide(CliConfigService.layer), Layer.provide(Session.layer))
}
