import { FetchHttpClient } from '@effect/platform'
import { RpcClient, RpcSerialization } from '@effect/rpc'
import type { RpcGroup } from '@effect/rpc'
import { AppRpcs } from '@scale/shared'
import { Context, Layer } from 'effect'

export class ApiClient extends Context.Tag('@scale/ApiClient')<
  ApiClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof AppRpcs>>
>() {
  static readonly layer = Layer.scoped(ApiClient, RpcClient.make(AppRpcs)).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: 'http://localhost:3001/rpc',
      }),
    ),
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  )
}

export const RpcLive = ApiClient.layer
