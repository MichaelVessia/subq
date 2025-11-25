import { HttpMiddleware, HttpRouter } from '@effect/platform'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcs } from '@scale/shared'
import { Layer } from 'effect'
import { createServer } from 'node:http'
import { RpcHandlersLive } from './RpcHandlers.js'
import { SqlLive } from './Sql.js'
import { RepositoriesLive } from './repositories/index.js'

const RpcLive = RpcServer.layer(AppRpcs).pipe(Layer.provide(RpcHandlersLive))

// HTTP server with all dependencies
const HttpLive = HttpRouter.Default.serve(HttpMiddleware.cors()).pipe(
  Layer.provide(RpcLive),
  Layer.provide(RpcServer.layerProtocolHttp({ path: '/rpc' })),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
  // Provide repositories to handlers
  Layer.provide(RepositoriesLive),
  // Provide SQL client to repositories
  Layer.provide(SqlLive),
)

NodeRuntime.runMain(Layer.launch(HttpLive))
