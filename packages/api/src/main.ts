import { FileSystem, HttpMiddleware, HttpRouter, HttpServerRequest, HttpServerResponse, Path } from '@effect/platform'
import { BunContext, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcs } from '@subq/shared'
import { bearer } from 'better-auth/plugins'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { Config, Effect, Layer, Logger, LogLevel, Redacted } from 'effect'
import { dirname, join } from 'node:path'
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
import { EmailService, EmailServiceLive, ReminderService, ReminderServiceLive } from './reminders/index.js'

// ============================================
// Database Migrations (sync, before Effect)
// ============================================
const runMigrations = () => {
  const databasePath = process.env.DATABASE_PATH || './data/subq.db'
  console.log(`Running migrations on: ${databasePath}`)

  const sqlite = new Database(databasePath)
  const db = drizzle(sqlite)
  const migrationsFolder = join(dirname(import.meta.path), '../drizzle')

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

runMigrations()

// Auth configuration layer - creates better-auth instance with SQLite
const AuthLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    yield* Effect.logInfo('Initializing auth service...')

    const databasePath = yield* Config.string('DATABASE_PATH').pipe(Config.withDefault('./data/subq.db'))
    const authSecret = yield* Config.redacted('BETTER_AUTH_SECRET')
    const authUrl = yield* Config.string('BETTER_AUTH_URL')

    // Detect if running over HTTPS (production)
    const isSecure = authUrl.startsWith('https://')

    yield* Effect.logDebug('Auth configuration loaded', {
      authUrl,
      databasePath,
      isSecure,
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
        expiresIn: 60 * 60 * 24 * 30, // 30 days
        updateAge: 60 * 60 * 24, // Refresh if session older than 1 day
        // Cache session in signed cookie to avoid DB lookup on every request
        cookieCache: {
          enabled: true,
          maxAge: 60 * 5, // 5 minutes
        },
      },
      advanced: {
        // Use secure cookies in production (HTTPS)
        useSecureCookies: isSecure,
        // Set sameSite to lax for same-site requests (works for both local dev and prod)
        defaultCookieAttributes: {
          sameSite: 'lax',
          path: '/',
        },
      },
      plugins: [bearer()],
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

// Static directory for production (SPA serving)
const STATIC_DIR = process.env.STATIC_DIR || './packages/web/dist'

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

// Production routes: health check, reminders API, static files
const ProductionRoutesLive = HttpRouter.Default.use((router) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const reminderService = yield* ReminderService
    const emailService = yield* EmailService

    // Health check endpoint
    yield* router.get('/health', Effect.succeed(HttpServerResponse.text('ok')))

    // Reminders endpoint (called by GitHub Actions)
    yield* router.post(
      '/api/reminders/send',
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const reminderSecret = yield* Config.redacted('REMINDER_SECRET')
        const secretValue = Redacted.value(reminderSecret)

        // Check bearer token - headers is a direct property, access authorization header
        const authHeader = request.headers.authorization
        if (!authHeader || authHeader !== `Bearer ${secretValue}`) {
          return yield* HttpServerResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check for force parameter
        const url = new URL(request.url, 'http://localhost')
        const force = url.searchParams.get('force') === 'true'

        yield* Effect.logInfo('Reminder request received', { force })

        // Get users to send reminders to
        const users = force
          ? yield* reminderService.getAllUsersWithActiveSchedule()
          : yield* reminderService.getUsersDueToday()

        yield* Effect.logInfo('Users found for reminders', { count: users.length, force })

        if (users.length === 0) {
          return yield* HttpServerResponse.json({
            sent: 0,
            failed: 0,
            errors: [],
            message: 'No users due for reminders',
          })
        }

        // Send emails
        const result = yield* emailService.sendReminderEmails(users)

        yield* Effect.logInfo('Reminder emails sent', result)

        return yield* HttpServerResponse.json(result)
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError('Reminder request failed', { error: String(error) })
            return yield* HttpServerResponse.json({ error: 'Internal server error' }, { status: 500 })
          }),
        ),
      ),
    )

    // Static file serving (catch-all, must be last)
    yield* router.get(
      '/*',
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, 'http://localhost')
        const pathname = url.pathname

        // Security: prevent directory traversal
        const safePath = pathname.replace(/\.\./g, '')
        const filePath = path.join(STATIC_DIR, safePath)

        // Determine Cache-Control header based on path
        const getCacheControl = (filePath: string, pathname: string): string => {
          // Hashed assets (Vite build output) - cache forever
          if (pathname.startsWith('/assets/')) {
            return 'public, max-age=31536000, immutable'
          }
          // index.html - always revalidate (references hashed assets)
          if (pathname === '/' || pathname.endsWith('.html')) {
            return 'no-cache'
          }
          // Other static files (fonts, images) - cache for 1 hour
          return 'public, max-age=3600'
        }

        // Check if file exists
        const exists = yield* fs.exists(filePath)
        if (exists) {
          const stat = yield* fs.stat(filePath)
          if (stat.type === 'File') {
            const ext = path.extname(filePath)
            const contentType = MIME_TYPES[ext] || 'application/octet-stream'
            const cacheControl = getCacheControl(filePath, pathname)
            const response = yield* HttpServerResponse.file(filePath, { contentType })
            return response.pipe(HttpServerResponse.setHeader('Cache-Control', cacheControl))
          }
        }

        // SPA fallback: serve index.html for non-file routes
        const indexPath = path.join(STATIC_DIR, 'index.html')
        const indexExists = yield* fs.exists(indexPath)
        if (indexExists) {
          const response = yield* HttpServerResponse.file(indexPath, { contentType: 'text/html' })
          return response.pipe(HttpServerResponse.setHeader('Cache-Control', 'no-cache'))
        }

        return HttpServerResponse.text('Not Found', { status: 404 })
      }).pipe(Effect.catchAll(() => Effect.succeed(HttpServerResponse.text('Not Found', { status: 404 })))),
    )
  }),
)

// Reminder services layer
const ReminderServicesLive = Layer.mergeAll(ReminderServiceLive.pipe(Layer.provide(SqlLive)), EmailServiceLive)

// Merge all route layers so they share the same Default router
const AllRoutesLive = Layer.mergeAll(AuthRoutesLive, RpcProtocolLive, ProductionRoutesLive)

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

// Server port configuration
const port = Number(process.env.PORT) || 3001

// HTTP server with all dependencies
const HttpLive = HttpRouter.Default.serve(corsMiddleware).pipe(
  Layer.provide(RpcLiveWithDeps),
  Layer.provide(AllRoutesLive),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(BunHttpServer.layer({ port })),
  // Provide auth service
  Layer.provide(AuthLive),
  // Provide reminder services
  Layer.provide(ReminderServicesLive),
  // Provide Bun context for FileSystem and Path (used by static file serving)
  Layer.provide(BunContext.layer),
  Layer.tap(() => Effect.logInfo(`HTTP server layer configured on port ${port}`)),
)

// HttpServerRequest is provided by the HTTP router at request time, not layer time.
// The type system doesn't see this, so we use a type cast.
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
  ) as Effect.Effect<never>,
)
