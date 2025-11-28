/**
 * Cloudflare Workers entrypoint
 *
 * This file exports a fetch handler for Cloudflare Workers.
 * For local development, use main.ts which runs on Node.
 */
import type { D1Database, ExecutionContext } from '@cloudflare/workers-types'
import { HttpApp } from '@effect/platform'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcs } from '@subq/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/d1'
import { Effect, Layer, Schema } from 'effect'
import { AuthRpcMiddlewareLive, AuthService, toWebHandler as authToWebHandler } from './auth/index.js'

class AuthError extends Schema.TaggedError<AuthError>()('AuthError', {
  cause: Schema.Defect,
}) {}
import * as schema from './db/schema.js'
import { InjectionLogRepoLive, InjectionRpcHandlersLive } from './injection/index.js'
import { InventoryRepoLive, InventoryRpcHandlersLive } from './inventory/index.js'
import { ScheduleRepoLive, ScheduleRpcHandlersLive } from './schedule/index.js'
import { StatsRpcHandlersLive, StatsServiceLive } from './stats/index.js'
import { WeightLogRepoLive, WeightRpcHandlersLive } from './weight/index.js'
import { makeD1Layer } from './sql-d1.js'
import { makeTracerLayer, type AxiomEnv } from './tracing/tracer.js'

// Environment bindings from Cloudflare Worker
interface Env extends AxiomEnv {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
}

// Allowed origins for CORS
const allowedOrigins = ['https://subq.vessia.net', 'http://localhost:5173', 'http://127.0.0.1:5173']

// Get CORS headers for a specific origin
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0]!
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, traceparent, b3, user-agent',
    'Access-Control-Allow-Credentials': 'true',
  }
}

// Handle CORS preflight
function handleOptions(request: Request): Response {
  const origin = request.headers.get('Origin')
  return new Response(null, { headers: getCorsHeaders(origin) })
}

// Add CORS headers to response
function withCors(request: Request, response: Response): Response {
  const origin = request.headers.get('Origin')
  const corsHeaders = getCorsHeaders(origin)
  const newHeaders = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}

// D1Database type from workers-types isn't the same as drizzle expects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyD1Database = any

// Create auth instance for D1
function createAuth(env: Env) {
  const d1Db = drizzle(env.DB as AnyD1Database, { schema })
  return betterAuth({
    database: drizzleAdapter(d1Db, { provider: 'sqlite', schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL, 'https://subq.vessia.net', 'http://localhost:5173', 'http://127.0.0.1:5173'],
    emailAndPassword: {
      enabled: true,
    },
  })
}

// Create layers for the RPC server
function createLayers(env: Env) {
  const auth = createAuth(env)

  // Auth service layer
  const AuthLive = Layer.succeed(AuthService, { auth })

  // Combined RPC handlers
  const RpcHandlersLive = Layer.mergeAll(
    WeightRpcHandlersLive,
    InjectionRpcHandlersLive,
    InventoryRpcHandlersLive,
    ScheduleRpcHandlersLive,
    StatsRpcHandlersLive,
  )

  // Combined repositories
  const RepositoriesLive = Layer.mergeAll(WeightLogRepoLive, InjectionLogRepoLive, InventoryRepoLive, ScheduleRepoLive)

  // D1 SQL layer
  const SqlLive = makeD1Layer(env.DB)

  // Tracer layer from env bindings
  const TracerLive = makeTracerLayer(env)

  // Full layer stack with tracing
  return Layer.mergeAll(RpcHandlersLive, AuthRpcMiddlewareLive, RpcSerialization.layerNdjson).pipe(
    Layer.provideMerge(RepositoriesLive),
    Layer.provideMerge(StatsServiceLive),
    Layer.provideMerge(AuthLive),
    Layer.provideMerge(SqlLive),
    Layer.provideMerge(TracerLive),
  )
}

// Cache for RPC handler
let rpcHandlerCache: {
  handler: (request: Request) => Promise<Response>
  dispose: () => Promise<void>
} | null = null
let lastEnvHash: string | null = null

function getEnvHash(env: Env): string {
  return `${env.BETTER_AUTH_SECRET}:${env.BETTER_AUTH_URL}:${env.AXIOM_API_TOKEN ?? ''}:${env.AXIOM_DATASET ?? ''}`
}

function getRpcHandler(env: Env) {
  const hash = getEnvHash(env)
  if (rpcHandlerCache && lastEnvHash === hash) {
    return rpcHandlerCache
  }

  // Dispose old handler if exists
  if (rpcHandlerCache) {
    rpcHandlerCache.dispose().catch(console.error)
  }

  const layers = createLayers(env)

  // Use toWebHandlerLayerWith which allows building the handler from runtime
  // The runtime provides all the services we've composed in our layer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcHandlerCache = HttpApp.toWebHandlerLayerWith(layers as any, {
    toHandler: (runtime) => Effect.provide(RpcServer.toHttpApp(AppRpcs), runtime),
  })
  lastEnvHash = hash
  return rpcHandlerCache
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request)
    }

    // Health check
    if (url.pathname === '/health') {
      return withCors(
        request,
        new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

    // RPC endpoint
    if (url.pathname === '/rpc') {
      const { handler } = getRpcHandler(env)
      const response = await handler(request)
      // Give time for traces to be exported before worker terminates
      ctx.waitUntil(new Promise((resolve) => setTimeout(resolve, 500)))
      return withCors(request, response)
    }

    // Auth routes
    if (url.pathname.startsWith('/api/auth/')) {
      const program = Effect.try({
        try: () => {
          const auth = createAuth(env)
          return authToWebHandler(auth)
        },
        catch: (error) => AuthError.make({ cause: error }),
      }).pipe(
        Effect.flatMap((authHandler) =>
          Effect.tryPromise({
            try: () => authHandler(request),
            catch: (error) => AuthError.make({ cause: error }),
          }),
        ),
        Effect.catchAll((error) => {
          console.error('Auth error:', error.cause)
          return Effect.succeed(
            new Response(JSON.stringify({ error: 'Internal auth error', message: String(error.cause) }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
          )
        }),
      )
      const response = await Effect.runPromise(program)
      return withCors(request, response)
    }

    // 404 for unknown routes
    return withCors(
      request,
      new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  },
}
