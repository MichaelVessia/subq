/**
 * Unified production server for Fly.io
 *
 * Serves both the API (/rpc, /api/auth/*) and static files (SPA).
 * Uses SQLite for persistence with Fly volume.
 */

import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcs } from '@subq/shared'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
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

// Static file directory (relative to where server runs from)
const STATIC_DIR = process.env.STATIC_DIR || './packages/web/dist'

// Run database migrations on startup
const runMigrations = () => {
  const databasePath = process.env.DATABASE_PATH || './data/subq.db'

  // Ensure the data directory exists
  mkdirSync(dirname(databasePath), { recursive: true })

  console.log(`Running migrations on: ${databasePath}`)

  const sqlite = new Database(databasePath)
  const db = drizzle(sqlite)

  // Migrations folder is relative to this file in the built output
  // In dev: packages/api/src/server.ts -> packages/api/drizzle
  // In prod: packages/api/src/server.ts -> packages/api/drizzle
  const migrationsFolder = join(import.meta.dir, '../drizzle')

  try {
    migrate(db, { migrationsFolder })
    console.log('Migrations completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    sqlite.close()
  }
}

// Run migrations before starting server
runMigrations()

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
}

// Serve static file or return null if not found
const serveStaticFile = (pathname: string): { content: Buffer; contentType: string } | null => {
  // Security: prevent directory traversal
  const safePath = pathname.replace(/\.\./g, '')
  const filePath = join(STATIC_DIR, safePath)

  if (!existsSync(filePath)) {
    return null
  }

  try {
    const content = readFileSync(filePath)
    const ext = extname(filePath)
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    return { content, contentType }
  } catch {
    return null
  }
}

// Serve index.html for SPA fallback
const serveIndexHtml = (): { content: Buffer; contentType: string } | null => {
  const indexPath = join(STATIC_DIR, 'index.html')
  try {
    const content = readFileSync(indexPath)
    return { content, contentType: 'text/html' }
  } catch {
    return null
  }
}

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
      trustedOrigins: [authUrl],
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

// Services that depend on SQL (stats, goals, data export)
const ServicesLive = Layer.mergeAll(StatsServiceLive, GoalServiceLive, DataExportServiceLive).pipe(
  Layer.provide(SqlLive),
)

// RPC handler layer with auth middleware
const RpcLive = RpcServer.layer(AppRpcs).pipe(
  Layer.provide(RpcHandlersLive),
  Layer.provide(AuthRpcMiddlewareLive),
  Layer.provide(ServicesLive),
  Layer.provide(RepositoriesLive),
  Layer.provide(SqlLive),
  Layer.tap(() => Effect.logInfo('RPC server layer initialized')),
)

// Auth routes layer - adds auth routes to the default router
const AuthRoutesLive = HttpRouter.Default.use((router) =>
  Effect.gen(function* () {
    yield* Effect.logInfo('Setting up auth routes...')
    const { auth } = yield* AuthService
    yield* router.all('/api/auth/*', toEffectHandler(auth))
    yield* Effect.logInfo('Auth routes configured')
  }),
)

// Health check route
const HealthRouteLive = HttpRouter.Default.use((router) =>
  router.get('/health', HttpServerResponse.json({ status: 'ok' })),
)

// Static file serving route (catch-all for SPA)
const StaticRoutesLive = HttpRouter.Default.use((router) =>
  router.get(
    '/*',
    Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
      const url = new URL(request.url, 'http://localhost')
      const pathname = url.pathname

      // Try to serve static file
      const staticFile = serveStaticFile(pathname)
      if (staticFile) {
        return Effect.succeed(
          HttpServerResponse.uint8Array(staticFile.content, {
            headers: { 'Content-Type': staticFile.contentType },
          }),
        )
      }

      // SPA fallback - serve index.html for non-file paths
      // (paths without extensions are assumed to be SPA routes)
      if (!extname(pathname)) {
        const indexFile = serveIndexHtml()
        if (indexFile) {
          return Effect.succeed(
            HttpServerResponse.uint8Array(indexFile.content, {
              headers: { 'Content-Type': indexFile.contentType },
            }),
          )
        }
      }

      // File not found
      return HttpServerResponse.json({ error: 'Not Found' }, { status: 404 })
    }),
  ),
)

// RPC Protocol + routes layer
const RpcProtocolLive = RpcServer.layerProtocolHttp({ path: '/rpc' }).pipe(Layer.provide(RpcSerialization.layerNdjson))

// Merge all route layers so they share the same Default router
// Order matters: specific routes before catch-all
const AllRoutesLive = Layer.mergeAll(AuthRoutesLive, HealthRouteLive, RpcProtocolLive, StaticRoutesLive)

// Get port from environment
const port = Number(process.env.PORT) || 3001

// HTTP server with all dependencies (no CORS needed - same origin)
const HttpLive = HttpRouter.Default.serve().pipe(
  Layer.provide(RpcLive),
  Layer.provide(AllRoutesLive),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(BunHttpServer.layer({ port, hostname: '0.0.0.0' })),
  // Provide auth service
  Layer.provide(AuthLive),
  Layer.tap(() => Effect.logInfo(`HTTP server layer configured on port ${port}`)),
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BunRuntime.runMain(
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
