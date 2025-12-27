// RPC client for the TUI
// Uses Effect RPC but exposes promise-based API for React

import { FetchHttpClient } from '@effect/platform'
import { RpcClient, RpcSerialization } from '@effect/rpc'
import type { RpcClientError } from '@effect/rpc/RpcClientError'
import { AppRpcs, type Unauthorized } from '@subq/shared'
import { Effect, Layer } from 'effect'
import { getConfig } from './config'
import { getSession } from './session'

// RPC client type
type AppRpcClient = RpcClient.FromGroup<typeof AppRpcs, RpcClientError>

// Get auth headers from session
function getAuthHeaders(): Record<string, string> {
  const session = getSession()
  if (session) {
    return { authorization: `Bearer ${session.sessionToken}` }
  }
  return {}
}

// Create the RPC layer
function createRpcLayer() {
  const config = getConfig()
  return RpcClient.layerProtocolHttp({ url: `${config.apiUrl}/rpc` }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  )
}

// Call an RPC method with auth headers
export async function rpcCall<A, E>(fn: (client: AppRpcClient) => Effect.Effect<A, E>): Promise<A> {
  const authHeaders = getAuthHeaders()
  const rpcLayer = createRpcLayer()

  const program = Effect.gen(function* () {
    const client = yield* RpcClient.make(AppRpcs)
    return yield* fn(client).pipe(RpcClient.withHeaders(authHeaders))
  }).pipe(Effect.provide(rpcLayer), Effect.scoped)

  return Effect.runPromise(program)
}

// Type-safe wrapper that provides the RPC client
export type { AppRpcClient }

// Re-export for convenience
export type ApiError = RpcClientError | Unauthorized
