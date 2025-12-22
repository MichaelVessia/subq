import type { Headers } from '@effect/platform/Headers'
import { AuthRpcMiddleware, Unauthorized } from '@subq/shared'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { AuthService } from './auth-service.js'

/**
 * Layer that provides the auth middleware implementation.
 * Extracts session from cookies or Authorization header via better-auth.
 * The bearer plugin converts Authorization: Bearer <token> to session cookie.
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

        // better-auth's getSession handles both cookies and Bearer tokens (via bearer plugin)
        const session = yield* Effect.promise(() => auth.api.getSession({ headers: headerObj })).pipe(
          Effect.catchAll(() => Effect.succeed(null)),
        )

        if (!session?.user) {
          yield* Effect.logDebug('Auth: no session found')
          return yield* new Unauthorized({ details: 'Not authenticated' })
        }

        yield* Effect.logDebug('Auth: session verified').pipe(
          Effect.annotateLogs({
            userId: session.user.id,
            email: session.user.email,
            sessionId: session.session.id,
          }),
        )

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
