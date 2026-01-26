/**
 * Login command for CLI authentication with sync endpoints.
 * Prompts for credentials, authenticates, stores token, and runs initial sync.
 */
import { Command, Options, Prompt } from '@effect/cli'
import { FetchHttpClient } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { LoginFailedError, SyncAuthError, SyncNetworkError } from '@subq/shared'
import { Console, Effect, Layer, Option, Redacted } from 'effect'
import os from 'node:os'
import pc from 'picocolors'
import { error, success } from '../lib/output.js'
import { LocalConfig, LocalDb, RemoteClient, sync } from '@subq/local'
import { ensureSchema } from '@subq/local'

// ============================================
// Options
// ============================================

const emailOption = Options.text('email').pipe(
  Options.withAlias('e'),
  Options.optional,
  Options.withDescription('Email address'),
)

const passwordOption = Options.text('password').pipe(
  Options.withAlias('p'),
  Options.optional,
  Options.withDescription('Password'),
)

// ============================================
// Prompts
// ============================================

const emailPrompt = Prompt.text({
  message: 'Email:',
})

const passwordPrompt = Prompt.password({
  message: 'Password:',
})

// ============================================
// Helpers
// ============================================

/**
 * Get hostname for device name.
 */
const getHostname = (): Effect.Effect<string, never, never> => Effect.sync(() => os.hostname())

/**
 * Run full sync with progress output.
 * Wraps the sync function with console output for user feedback.
 */
const fullSyncWithProgress = (): Effect.Effect<
  void,
  SyncNetworkError | SyncAuthError,
  LocalDb | RemoteClient | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    yield* Console.log(pc.dim('Syncing data...'))
    yield* sync()
    yield* Console.log(pc.dim('Sync complete.'))
  })

/**
 * Create database layer for local SQLite.
 */
const makeDbLayer = () => {
  const home = process.env.HOME ?? '~'
  const dbPath = `${home}/.subq/data.db`

  return SqliteClient.layer({
    filename: dbPath,
  })
}

// ============================================
// Command
// ============================================

export const loginCommand = Command.make(
  'login',
  { email: emailOption, password: passwordOption },
  ({ email: emailOpt, password: passwordOpt }) =>
    Effect.gen(function* () {
      // Get email - from option or prompt
      let email: string
      if (Option.isSome(emailOpt)) {
        email = emailOpt.value
      } else {
        email = yield* emailPrompt
      }

      // Get password - from option or prompt
      let password: string
      if (Option.isSome(passwordOpt)) {
        password = passwordOpt.value
      } else {
        const redactedPassword = yield* passwordPrompt
        password = Redacted.value(redactedPassword)
      }

      const deviceName = yield* getHostname()

      yield* Console.log(pc.dim('Authenticating...'))

      // Authenticate with server using RemoteClient.Default layer
      // Provide FetchHttpClient.layer for HTTP requests
      const authResult = yield* Effect.gen(function* () {
        const remote = yield* RemoteClient
        const result = yield* remote.authenticate({ email, password, deviceName }).pipe(Effect.either)
        return result
      }).pipe(Effect.provide(RemoteClient.Default), Effect.provide(FetchHttpClient.layer), Effect.scoped)

      if (authResult._tag === 'Left') {
        const err = authResult.left
        const message = getLoginErrorMessage(err)
        yield* error(message)
        return
      }

      const { token } = authResult.right

      // Store token in config
      yield* Effect.gen(function* () {
        const config = yield* LocalConfig
        yield* config.set('auth_token', token)
      }).pipe(Effect.provide(LocalConfig.Default))

      yield* success(`Logged in as ${email}`)

      // Run initial sync
      const dbLayer = makeDbLayer()
      const localDbLayer = LocalDb.layer.pipe(Layer.provide(dbLayer), Layer.provide(BunContext.layer))

      const syncLayer = Layer.mergeAll(
        localDbLayer,
        RemoteClient.Default.pipe(Layer.provide(FetchHttpClient.layer)),
        dbLayer,
      )

      const syncResult = yield* Effect.gen(function* () {
        // Ensure schema is up to date
        yield* ensureSchema()
        // Run sync
        yield* fullSyncWithProgress()
      }).pipe(Effect.provide(syncLayer), Effect.scoped, Effect.either)

      if (syncResult._tag === 'Left') {
        const err = syncResult.left
        if ('_tag' in err) {
          const message = getSyncErrorMessage(err)
          yield* Console.log(pc.yellow(`Warning: Initial sync failed - ${message}`))
          yield* Console.log(pc.dim('You can run "subq sync" later to sync your data.'))
        }
      }
    }),
).pipe(Command.withDescription('Log in and sync your data'))

// ============================================
// Error Message Helpers
// ============================================

const getLoginErrorMessage = (err: LoginFailedError): string => {
  switch (err.reason) {
    case 'invalid_credentials':
      return 'Invalid email or password'
    case 'account_locked':
      return 'Account is locked'
    case 'network_error':
      return 'Network error - check your connection'
  }
}

const getSyncErrorMessage = (err: SyncNetworkError | SyncAuthError): string => {
  if (err._tag === 'SyncNetworkError') {
    return 'Network error during sync'
  }
  return 'Authentication error during sync'
}
