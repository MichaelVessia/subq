/**
 * Log command for CLI. Logs injection to local database + outbox.
 * This is a simplified command for quick logging (no network call).
 *
 * Usage: subq log 0.5mg -d semaglutide -s "left abdomen"
 */
import { Args, Command, Options } from '@effect/cli'
import { BunContext } from '@effect/platform-bun'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { Clock, Console, Effect, Layer, Option } from 'effect'
import pc from 'picocolors'
import { LocalConfig, LocalDb } from '@subq/local'
import { Dosage, DrugName, DrugSource, InjectionSite, Notes } from '@subq/shared'
import { randomUUID } from 'node:crypto'
import { NotLoggedInError } from '../errors.js'

// ============================================
// Error
// ============================================

export { NotLoggedInError } from '../errors.js'

// ============================================
// Options
// ============================================

const dosageArg = Args.text({ name: 'dosage' }).pipe(Args.withDescription('Dosage amount (e.g., "0.5mg", "10 units")'))

const drugOption = Options.text('drug').pipe(
  Options.withAlias('d'),
  Options.withDefault('semaglutide'),
  Options.withDescription('Drug name (e.g., "semaglutide", "tirzepatide")'),
)

const siteOption = Options.text('site').pipe(
  Options.withAlias('s'),
  Options.optional,
  Options.withDescription('Injection site (e.g., "left abdomen")'),
)

const sourceOption = Options.text('source').pipe(Options.optional, Options.withDescription('Drug source/pharmacy'))

const notesOption = Options.text('notes').pipe(
  Options.withAlias('n'),
  Options.optional,
  Options.withDescription('Optional notes'),
)

// ============================================
// Helpers
// ============================================

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

/**
 * Check if user is logged in.
 * Returns the auth token if logged in, fails with NotLoggedInError otherwise.
 * PlatformErrors from config access are converted to NotLoggedInError.
 */
export const requireLogin = (): Effect.Effect<string, NotLoggedInError, LocalConfig> =>
  Effect.gen(function* () {
    const config = yield* LocalConfig
    const maybeToken = yield* config.getAuthToken().pipe(Effect.catchAll(() => Effect.succeed(Option.none<string>())))

    if (Option.isNone(maybeToken)) {
      return yield* Effect.fail(new NotLoggedInError({ message: 'Not logged in. Run "subq login" first.' }))
    }

    return maybeToken.value
  })

// ============================================
// Command
// ============================================

export const logCommand = Command.make(
  'log',
  {
    dosage: dosageArg,
    drug: drugOption,
    site: siteOption,
    source: sourceOption,
    notes: notesOption,
  },
  ({ dosage, drug, site, source, notes }) =>
    Effect.gen(function* () {
      // Check for auth token (require login)
      const loginResult = yield* requireLogin().pipe(Effect.provide(LocalConfig.Default), Effect.either)

      if (loginResult._tag === 'Left') {
        yield* Console.log(pc.red(loginResult.left.message))
        return
      }

      // Build the layer for LocalDb
      const dbLayer = makeDbLayer()
      const localDbLayer = LocalDb.layer.pipe(Layer.provide(dbLayer), Layer.provide(BunContext.layer))

      // Write to local DB + outbox
      const writeResult = yield* Effect.gen(function* () {
        const local = yield* LocalDb
        const clock = yield* Clock.Clock

        const id = randomUUID()
        const now = yield* clock.currentTimeMillis
        const nowIso = new Date(now).toISOString()

        const payload: Record<string, unknown> = {
          id,
          datetime: nowIso,
          drug: drug as DrugName,
          dosage: dosage as Dosage,
          source: Option.isSome(source) ? (source.value as DrugSource) : null,
          injection_site: Option.isSome(site) ? (site.value as InjectionSite) : null,
          notes: Option.isSome(notes) ? (notes.value as Notes) : null,
          schedule_id: null,
          user_id: null, // Will be filled by server on sync
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        }

        yield* local.writeWithOutbox({
          table: 'injection_logs',
          id,
          operation: 'insert',
          payload,
        })

        return { id, dosage, drug }
      }).pipe(Effect.provide(localDbLayer), Effect.scoped, Effect.either)

      if (writeResult._tag === 'Left') {
        yield* Console.log(pc.red('Failed to log injection.'))
        return
      }

      const { dosage: loggedDosage, drug: loggedDrug } = writeResult.right
      yield* Console.log(pc.green(`Logged ${loggedDosage} ${loggedDrug}`))
      yield* Console.log(pc.dim('Changes will sync automatically.'))
    }),
).pipe(Command.withDescription('Log an injection to local database'))
