import { type BetterAuthOptions, betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Context from 'effect/Context'

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
