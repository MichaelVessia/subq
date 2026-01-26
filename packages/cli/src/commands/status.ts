/**
 * Status command for CLI. Shows pending change count and last sync time.
 */
import { Command } from '@effect/cli'
import { BunContext } from '@effect/platform-bun'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { Console, Effect, Layer, Option } from 'effect'
import pc from 'picocolors'
import { LocalConfig, LocalDb } from '@subq/local'

// ============================================
// Helpers
// ============================================

/**
 * Format an ISO date string as relative time (e.g., "2 hours ago").
 */
const formatRelativeTime = (isoDate: string): string => {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) {
    return 'just now'
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  }
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

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

export const statusCommand = Command.make('status', {}, () =>
  Effect.gen(function* () {
    // Check for auth token (require login)
    const maybeToken = yield* Effect.gen(function* () {
      const config = yield* LocalConfig
      return yield* config.getAuthToken()
    }).pipe(Effect.provide(LocalConfig.Default))

    if (Option.isNone(maybeToken)) {
      yield* Console.log(pc.yellow('Not logged in.'))
      yield* Console.log(pc.dim('Run "subq login" to authenticate.'))
      return
    }

    // Build the layer for LocalDb
    const dbLayer = makeDbLayer()
    const localDbLayer = LocalDb.layer.pipe(Layer.provide(dbLayer), Layer.provide(BunContext.layer))

    // Get outbox count and last sync time
    const result = yield* Effect.gen(function* () {
      const local = yield* LocalDb

      // Get outbox count
      const outbox = yield* local.getOutbox({ limit: 10000 }) // High limit to get total count
      const pendingCount = outbox.length

      // Get last sync cursor (which is the last sync time)
      const lastSyncCursor = yield* local.getMeta('last_sync_cursor')

      return { pendingCount, lastSyncCursor }
    }).pipe(Effect.provide(localDbLayer), Effect.scoped, Effect.either)

    if (result._tag === 'Left') {
      yield* Console.log(pc.dim('Unable to read local database.'))
      return
    }

    const { pendingCount, lastSyncCursor } = result.right

    // Display status
    yield* Console.log('')
    yield* Console.log(pc.bold('Sync Status'))
    yield* Console.log('')

    // Pending changes
    if (pendingCount === 0) {
      yield* Console.log(`  ${pc.green('0 pending')} changes`)
    } else {
      yield* Console.log(`  ${pc.yellow(`${pendingCount} pending`)} change${pendingCount === 1 ? '' : 's'}`)
    }

    // Last sync time
    if (Option.isNone(lastSyncCursor)) {
      yield* Console.log(`  ${pc.dim('Never synced')}`)
    } else {
      const relativeTime = formatRelativeTime(lastSyncCursor.value)
      yield* Console.log(`  Last synced: ${pc.cyan(relativeTime)}`)
    }

    yield* Console.log('')
  }),
).pipe(Command.withDescription('Show sync status'))
