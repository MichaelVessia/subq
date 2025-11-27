import type { Headers } from '@effect/platform/Headers'
import { AuthRpcMiddleware, Unauthorized } from '@subq/shared'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { AuthService } from './auth-service.js'

/**
 * Layer that provides the auth middleware implementation.
 * Extracts session from cookies via better-auth using RPC headers.
 */
export const AuthRpcMiddlewareLive = Layer.effect(
  AuthRpcMiddleware,
  Effect.gen(function* () {
    const { auth } = yield* AuthService

    return AuthRpcMiddleware.of(({ headers }: { headers: Headers }) =>
      Effect.gen(function* () {
        // Convert Headers to a plain object for better-auth
        const headerObj: Record<string, string> = {}
        for (const [key, value] of Object.entries(headers)) {
          if (typeof value === 'string') {
            headerObj[key] = value
          }
        }

        // Get session from better-auth using the request headers
        const session = yield* Effect.tryPromise({
          try: () => auth.api.getSession({ headers: headerObj }),
          catch: () => new Unauthorized({ details: 'Failed to verify session' }),
        })

        if (!session?.user) {
          return yield* new Unauthorized({ details: 'Not authenticated' })
        }

        return {
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
          },
          session: {
            id: session.session.id,
            userId: session.session.userId,
          },
        }
      }),
    )
  }),
)
