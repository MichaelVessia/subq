import { HttpRouter } from '@effect/platform'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcs } from '@scale/shared'
import { Layer } from 'effect'
import { createServer } from 'node:http'
import { RpcHandlersLive } from './RpcHandlers.js'

const RpcLive = RpcServer.layer(AppRpcs).pipe(Layer.provide(RpcHandlersLive))

const HttpLive = HttpRouter.Default.serve().pipe(
  Layer.provide(RpcLive),
  Layer.provide(RpcServer.layerProtocolHttp({ path: '/rpc' })),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
)

NodeRuntime.runMain(Layer.launch(HttpLive))
