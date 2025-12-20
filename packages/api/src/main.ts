import { createServer } from 'node:http'
import { HttpMiddleware, HttpRouter } from '@effect/platform'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcs } from '@subq/shared'
import { Database } from 'bun:sqlite'
import { Config, Effect, Layer, Logger, LogLevel, Redacted } from 'effect'
import { AuthRpcMiddlewareLive, AuthService, AuthServiceLive, toEffectHandler } from './auth/index.js'
import { DataExportRpcHandlersLive, DataExportServiceLive } from './data-export/index.js'
import { GoalRepoLive, GoalRpcHandlersLive, GoalServiceLive } from './goals/index.js'
import { InjectionLogRepoLive, InjectionRpcHandlersLive } from './injection/index.js'
import { InventoryRepoLive, InventoryRpcHandlersLive } from './inventory/index.js'
import { ScheduleRepoLive, ScheduleRpcHandlersLive } from './schedule/index.js'
import { SettingsRepoLive, SettingsRpcHandlersLive } from './settings/index.js'
import { SqlLive } from './sql.js'
import { StatsRpcHandlersLive, StatsServiceLive } from './stats/index.js'
import { TracerLayer } from './tracing/index.js'
import { WeightLogRepoLive, WeightRpcHandlersLive } from './weight/index.js'

// Auth configuration layer - creates better-auth instance with SQLite
const AuthLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    yield* Effect.logInfo('Initializing auth service...')

    const databasePath = yield* Config.string('DATABASE_PATH').pipe(Config.withDefault('./data/subq.db'))
    const authSecret = yield* Config.redacted('BETTER_AUTH_SECRET')
    const authUrl = yield* Config.string('BETTER_AUTH_URL')

    yield* Effect.logDebug('Auth configuration loaded', {
      authUrl,
      databasePath,
      hasAuthSecret: !!Redacted.value(authSecret),
    })

    // Use better-sqlite3 for auth
    const sqlite = new Database(databasePath)
    yield* Effect.logInfo('SQLite database opened for auth service')

    return AuthServiceLive({
      database: sqlite,
      secret: Redacted.value(authSecret),
      baseURL: authUrl,
      trustedOrigins: [authUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      emailAndPassword: {
        enabled: true,
      },
      session: {
        // Cache session in signed cookie to avoid DB lookup on every request
        cookieCache: {
          enabled: true,
          maxAge: 60 * 5, // 5 minutes
        },
      },
    })
  }).pipe(Effect.tap(() => Effect.logInfo('Auth service initialized successfully'))),
)

// Combine all domain RPC handlers
const RpcHandlersLive = Layer.mergeAll(
  WeightRpcHandlersLive,
  InjectionRpcHandlersLive,
  InventoryRpcHandlersLive,
  ScheduleRpcHandlersLive,
  StatsRpcHandlersLive,
  GoalRpcHandlersLive,
  SettingsRpcHandlersLive,
  DataExportRpcHandlersLive,
).pipe(Layer.tap(() => Effect.logInfo('RPC handlers layer initialized')))

// Combined repositories layer
const RepositoriesLive = Layer.mergeAll(
  WeightLogRepoLive,
  InjectionLogRepoLive,
  InventoryRepoLive,
  ScheduleRepoLive,
  GoalRepoLive,
  SettingsRepoLive,
).pipe(Layer.tap(() => Effect.logInfo('Repository layer initialized')))

// CORS configuration - allow both localhost and 127.0.0.1
const corsMiddleware = HttpMiddleware.cors({
  allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // Include tracing headers (traceparent, b3) that Effect RPC client sends
  allowedHeaders: ['Content-Type', 'Authorization', 'traceparent', 'b3', 'user-agent'],
})

// Auth routes layer - adds auth routes to the default router
const AuthRoutesLive = HttpRouter.Default.use((router) =>
  Effect.gen(function* () {
    yield* Effect.logInfo('Setting up auth routes...')
    const { auth } = yield* AuthService
    yield* router.all('/api/auth/*', toEffectHandler(auth))
    yield* Effect.logInfo('Auth routes configured')
  }),
)

// RPC Protocol + routes layer
// Uses layerProtocolHttp but we'll merge it differently to share the router
const RpcProtocolLive = RpcServer.layerProtocolHttp({ path: '/rpc' }).pipe(Layer.provide(RpcSerialization.layerNdjson))

// Merge all route layers so they share the same Default router
const AllRoutesLive = Layer.mergeAll(AuthRoutesLive, RpcProtocolLive)

// Services that depend on SQL
const ServicesLive = Layer.mergeAll(StatsServiceLive, GoalServiceLive, DataExportServiceLive).pipe(
  Layer.provide(SqlLive),
)

// RPC handler layer with auth middleware - needs services and repos
const RpcLiveWithDeps = RpcServer.layer(AppRpcs).pipe(
  Layer.provide(RpcHandlersLive),
  Layer.provide(AuthRpcMiddlewareLive),
  Layer.provide(ServicesLive),
  Layer.provide(RepositoriesLive),
  Layer.provide(SqlLive),
  Layer.tap(() => Effect.logInfo('RPC server layer initialized')),
)

// HTTP server with all dependencies
const HttpLive = HttpRouter.Default.serve(corsMiddleware).pipe(
  Layer.provide(RpcLiveWithDeps),
  Layer.provide(AllRoutesLive),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
  // Provide auth service
  Layer.provide(AuthLive),
  Layer.tap(() => Effect.logInfo('HTTP server layer configured on port 3001')),
)

// HttpServerRequest is provided by the HTTP router at request time, not layer time.
// The type system doesn't see this, so we use a type cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
NodeRuntime.runMain(
  Layer.launch(HttpLive.pipe(Layer.provide(TracerLayer))).pipe(
    Logger.withMinimumLogLevel(LogLevel.Info),
    Effect.tap(() => Effect.logInfo('Application startup complete')),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.logError('Application startup failed', { error: error.message })
        yield* Effect.logError('Error details', { error: String(error) })
        return yield* Effect.fail(error)
      }),
    ),
  ) as any,
)
