import { Rpc, RpcGroup } from '@effect/rpc'
import { CliAuthRpcMiddleware } from './cli-auth-middleware.js'
import { InvalidTokenError, LoginFailedError } from './sync-errors.js'
import { AuthRequest, AuthResponse, PullRequest, PullResponse } from './sync-schemas.js'

// ============================================
// Public Sync RPCs (no auth required)
// ============================================

export const SyncPublicRpcs = RpcGroup.make(
  Rpc.make('SyncAuthenticate', {
    payload: AuthRequest,
    success: AuthResponse,
    error: LoginFailedError,
  }),
)

// ============================================
// Protected Sync RPCs (requires CLI auth)
// ============================================

export const SyncProtectedRpcs = RpcGroup.make(
  Rpc.make('SyncPull', {
    payload: PullRequest,
    success: PullResponse,
    error: InvalidTokenError,
  }),
).middleware(CliAuthRpcMiddleware)

// ============================================
// Combined Sync RPCs
// ============================================

export const SyncRpcs = SyncPublicRpcs.merge(SyncProtectedRpcs)
