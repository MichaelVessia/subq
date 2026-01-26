/**
 * Logout command for CLI. Removes auth token and deletes local database.
 */
import { Command } from '@effect/cli'
import { FileSystem, Path } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { Console, Effect, Layer, Option } from 'effect'
import pc from 'picocolors'
import { LocalConfig } from '@subq/local'
import { success } from '../lib/output.js'

// ============================================
// Helpers
// ============================================

/**
 * Get the path to the data.db file.
 */
const getDbPath = Effect.gen(function* () {
  const path = yield* Path.Path
  const home = process.env.HOME ?? '~'
  return path.join(home, '.subq', 'data.db')
})

/**
 * Delete the local database file if it exists.
 */
const deleteLocalDatabase = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const dbPath = yield* getDbPath

  const exists = yield* fs.exists(dbPath)
  if (exists) {
    yield* fs.remove(dbPath)
    yield* Console.log(pc.dim('Deleted local database.'))
  }
})

// ============================================
// Command
// ============================================

export const logoutCommand = Command.make('logout', {}, () =>
  Effect.gen(function* () {
    // Check if already logged out
    const maybeToken = yield* Effect.gen(function* () {
      const config = yield* LocalConfig
      return yield* config.getAuthToken()
    }).pipe(Effect.provide(LocalConfig.Default))

    if (Option.isNone(maybeToken)) {
      yield* Console.log(pc.dim('Already logged out.'))
      // Still delete local database if it exists
      yield* deleteLocalDatabase.pipe(Effect.provide(BunContext.layer))
      return
    }

    // Remove auth token from config
    yield* Effect.gen(function* () {
      const config = yield* LocalConfig
      yield* config.delete('auth_token')
      // Also clear the sync cursor since we're starting fresh
      yield* config.delete('last_sync_cursor')
    }).pipe(Effect.provide(LocalConfig.Default))

    // Delete local database
    yield* deleteLocalDatabase.pipe(Effect.provide(BunContext.layer))

    yield* success('Logged out successfully.')
  }),
).pipe(Command.withDescription('Log out and delete local data'))
