import { createServer } from 'node:http'
import { HttpMiddleware, HttpRouter } from '@effect/platform'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcs } from '@scale/shared'
import { Config, Effect, Layer } from 'effect'
import { Pool } from 'pg'
import { AuthRpcMiddlewareLive, AuthService, AuthServiceLive, toEffectHandler } from './auth/index.js'
import { RpcHandlersLive } from './RpcHandlers.js'
import { RepositoriesLive } from './repositories/index.js'
import { SqlLive } from './Sql.js'
import { StatsServiceLive } from './services/StatsService.js'

// Auth configuration layer - creates better-auth instance with postgres
const AuthLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const databaseUrl = yield* Config.string('DATABASE_URL')
    const authSecret = yield* Config.string('BETTER_AUTH_SECRET')
    const authUrl = yield* Config.string('BETTER_AUTH_URL')

    const pool = new Pool({ connectionString: databaseUrl })

    return AuthServiceLive({
      database: pool,
      secret: authSecret,
      baseURL: authUrl,
      trustedOrigins: [authUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      emailAndPassword: {
        enabled: true,
      },
    })
  }),
)

// RPC handler layer with auth middleware
const RpcLive = RpcServer.layer(AppRpcs).pipe(Layer.provide(RpcHandlersLive), Layer.provide(AuthRpcMiddlewareLive))

// CORS configuration - allow both localhost and 127.0.0.1
const corsMiddleware = HttpMiddleware.cors({
  allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // Include tracing headers (traceparent, b3) that Effect RPC client sends
  allowedHeaders: ['Content-Type', 'Authorization', 'traceparent', 'b3'],
})

// Auth routes layer - adds auth routes to the default router
const AuthRoutesLive = HttpRouter.Default.use((router) =>
  Effect.gen(function* () {
    const { auth } = yield* AuthService
    yield* router.all('/api/auth/*', toEffectHandler(auth))
  }),
)

// RPC Protocol + routes layer
// Uses layerProtocolHttp but we'll merge it differently to share the router
const RpcProtocolLive = RpcServer.layerProtocolHttp({ path: '/rpc' }).pipe(Layer.provide(RpcSerialization.layerNdjson))

// Merge all route layers so they share the same Default router
const AllRoutesLive = Layer.mergeAll(AuthRoutesLive, RpcProtocolLive)

// HTTP server with all dependencies
const HttpLive = HttpRouter.Default.serve(corsMiddleware).pipe(
  Layer.provide(RpcLive),
  Layer.provide(AllRoutesLive),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
  // Provide repositories and services to handlers
  Layer.provide(RepositoriesLive),
  Layer.provide(StatsServiceLive),
  // Provide auth service
  Layer.provide(AuthLive),
  // Provide SQL client to repositories and services
  Layer.provide(SqlLive),
)

// HttpServerRequest is provided by the HTTP router at request time, not layer time.
// The type system doesn't see this, so we use a type cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
NodeRuntime.runMain(Layer.launch(HttpLive) as any)
