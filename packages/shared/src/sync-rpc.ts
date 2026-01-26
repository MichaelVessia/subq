import { Rpc, RpcGroup } from '@effect/rpc'
import { LoginFailedError } from './sync-errors.js'
import { AuthRequest, AuthResponse } from './sync-schemas.js'

// ============================================
// Sync RPCs (no auth middleware - public endpoints)
// ============================================

export const SyncRpcs = RpcGroup.make(
  Rpc.make('SyncAuthenticate', {
    payload: AuthRequest,
    success: AuthResponse,
    error: LoginFailedError,
  }),
)
