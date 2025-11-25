import { type BetterAuthOptions, betterAuth, type Session, type User } from 'better-auth'
import { getMigrations } from 'better-auth/db'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'

export type AuthInstance = ReturnType<typeof betterAuth>

export class AuthService extends Context.Tag('AuthService')<AuthService, { readonly auth: AuthInstance }>() {}

export const AuthServiceLive = (options: BetterAuthOptions) =>
  Layer.effect(
    AuthService,
    Effect.gen(function* () {
      yield* Effect.logInfo('Creating auth instance...')
      const { runMigrations } = yield* Effect.promise(() => getMigrations(options))
      yield* Effect.promise(runMigrations)
      yield* Effect.logInfo('Auth migrations complete')
      return { auth: betterAuth(options) }
    }),
  )

// Auth context for authenticated requests
export class AuthContext extends Context.Tag('AuthContext')<
  AuthContext,
  { readonly user: User; readonly session: Session }
>() {}

// Error for unauthorized access
export class Unauthorized extends Schema.TaggedError<Unauthorized>()('Unauthorized', {
  details: Schema.String,
}) {}
