import { RpcMiddleware } from '@effect/rpc'
import { Context } from 'effect'
import { UserId } from './common/domain.js'
import { InvalidTokenError } from './sync-errors.js'

// CLI Auth context for authenticated sync requests
export class CliAuthContext extends Context.Tag('CliAuthContext')<CliAuthContext, { readonly userId: UserId }>() {}

/**
 * RPC Middleware that validates CLI tokens from Authorization header
 * and provides CliAuthContext to sync RPC handlers.
 */
export class CliAuthRpcMiddleware extends RpcMiddleware.Tag<CliAuthRpcMiddleware>()('CliAuthRpcMiddleware', {
  provides: CliAuthContext,
  failure: InvalidTokenError,
}) {}
