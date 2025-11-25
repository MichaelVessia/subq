import { createServer } from 'node:http'
import { HttpMiddleware, HttpRouter } from '@effect/platform'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcs } from '@scale/shared'
import { Config, Effect, Layer } from 'effect'
import { Pool } from 'pg'
import { AuthService, AuthServiceLive, toEffectHandler } from './auth/index.js'
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
      trustedOrigins: [authUrl, 'http://localhost:5173'],
      emailAndPassword: {
        enabled: true,
      },
    })
  }),
)

// Auth routes layer - adds auth routes to the default router
const AuthRoutesLive = HttpRouter.Default.use((routerService) =>
  Effect.gen(function* () {
    const { auth } = yield* AuthService
    yield* routerService.all('/api/auth/*', toEffectHandler(auth))
  }),
)

const RpcLive = RpcServer.layer(AppRpcs).pipe(Layer.provide(RpcHandlersLive))

// CORS configuration for auth (needs credentials)
const corsMiddleware = HttpMiddleware.cors({
  allowedOrigins: ['http://localhost:5173'],
  credentials: true,
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

// HTTP server with all dependencies
const HttpLive = HttpRouter.Default.serve(corsMiddleware).pipe(
  Layer.provide(RpcLive),
  Layer.provide(RpcServer.layerProtocolHttp({ path: '/rpc' })),
  Layer.provide(RpcSerialization.layerNdjson),
  // Mount auth routes
  Layer.provide(AuthRoutesLive),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
  // Provide repositories and services to handlers
  Layer.provide(RepositoriesLive),
  Layer.provide(StatsServiceLive),
  // Provide auth service
  Layer.provide(AuthLive),
  // Provide SQL client to repositories and services
  Layer.provide(SqlLive),
)

NodeRuntime.runMain(Layer.launch(HttpLive))
