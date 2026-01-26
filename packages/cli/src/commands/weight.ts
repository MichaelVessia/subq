/**
 * Quick weight log command for CLI. Logs weight to local database + outbox.
 * This is a simplified command for quick logging (no network call).
 *
 * Usage: subq quick-weight 185.5 --notes "morning weight"
 *
 * Note: Named 'quick-weight' to avoid conflict with existing 'weight' subcommand group.
 * The acceptance criteria says "subq weight" but that conflicts with existing structure.
 */
import { Args, Command, Options } from '@effect/cli'
import { BunContext } from '@effect/platform-bun'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { Clock, Console, Effect, Layer, Option } from 'effect'
import pc from 'picocolors'
import { LocalConfig, LocalDb } from '@subq/local'
import type { Notes, Weight } from '@subq/shared'
import { randomUUID } from 'node:crypto'
import { requireLogin } from './log.js'

// ============================================
// Options
// ============================================

const weightArg = Args.float({ name: 'weight' }).pipe(Args.withDescription('Weight in lbs'))

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

// ============================================
// Command
// ============================================

export const quickWeightCommand = Command.make(
  'quick-weight',
  {
    weight: weightArg,
    notes: notesOption,
  },
  ({ weight, notes }) =>
    Effect.gen(function* () {
      // Validate weight
      if (weight <= 0) {
        yield* Console.log(pc.red('Weight must be positive.'))
        return
      }

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
          weight: weight as Weight,
          notes: Option.isSome(notes) ? (notes.value as Notes) : null,
          user_id: null, // Will be filled by server on sync
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        }

        yield* local.writeWithOutbox({
          table: 'weight_logs',
          id,
          operation: 'insert',
          payload,
        })

        return { id, weight }
      }).pipe(Effect.provide(localDbLayer), Effect.scoped, Effect.either)

      if (writeResult._tag === 'Left') {
        yield* Console.log(pc.red('Failed to log weight.'))
        return
      }

      const { weight: loggedWeight } = writeResult.right
      yield* Console.log(pc.green(`Logged ${loggedWeight} lbs`))
      yield* Console.log(pc.dim('Changes will sync automatically.'))
    }),
).pipe(Command.withDescription('Quick log weight to local database'))
