import { RpcMiddleware } from '@effect/rpc'
import { Context, Schema } from 'effect'

// Minimal user/session types (matches better-auth structure)
export interface AuthUser {
  readonly id: string
  readonly email: string
  readonly name: string
}

export interface AuthSession {
  readonly id: string
  readonly userId: string
}

// Auth context for authenticated requests
export class AuthContext extends Context.Tag('AuthContext')<
  AuthContext,
  { readonly user: AuthUser; readonly session: AuthSession }
>() {}

// Error for unauthorized access
export class Unauthorized extends Schema.TaggedError<Unauthorized>()('Unauthorized', {
  details: Schema.String,
}) {}

/**
 * RPC Middleware that extracts the authenticated user from request headers
 * and provides AuthContext to RPC handlers.
 */
export class AuthRpcMiddleware extends RpcMiddleware.Tag<AuthRpcMiddleware>()('AuthRpcMiddleware', {
  provides: AuthContext,
  failure: Unauthorized,
}) {}
