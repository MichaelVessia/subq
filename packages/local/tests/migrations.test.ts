/**
 * Tests for schema version management (migrations.ts).
 * Uses in-memory SQLite with it.layer pattern for test isolation.
 */
import { FileSystem, Path } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { SchemaVersionError } from '@subq/shared'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Either, Layer, Option } from 'effect'
import { ensureSchema, EMBEDDED_SCHEMA_VERSION } from '../src/migrations.js'
import { LocalDb } from '../src/services/LocalDb.js'

// ============================================
// Test Layer Setup
// ============================================

// In-memory SQLite for tests
const SqliteTestLayer = SqliteClient.layer({ filename: ':memory:' })

// Read and execute schema.sql
const initSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  // Read schema.sql from src/db/
  const schemaPath = path.join(import.meta.dir, '..', 'src', 'db', 'schema.sql')
  const schemaSql = yield* fs.readFileString(schemaPath)

  // Remove comment lines first, then split by semicolon
  const withoutComments = schemaSql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  // Execute each statement
  const statements = withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const statement of statements) {
    yield* sql.unsafe(statement)
  }
})

// Combined test layer with LocalDb service
const makeTestLayer = () =>
  Layer.effect(
    LocalDb,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      // Service implementation (simplified for tests)
      const getMeta = (key: string) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ value: string }>`
            SELECT value FROM sync_meta WHERE key = ${key}
          `
          if (rows.length === 0) {
            return Option.none<string>()
          }
          return Option.some(rows[0].value)
        })

      const setMeta = (key: string, value: string) =>
        sql`
          INSERT OR REPLACE INTO sync_meta (key, value) VALUES (${key}, ${value})
        `.pipe(Effect.asVoid)

      // Other methods not needed for migration tests but required by interface
      const getOutbox = () => Effect.succeed([])
      const clearOutbox = () => Effect.void
      const applyChanges = () => Effect.void
      const applyServerVersion = () => Effect.void
      const removeFromOutbox = () => Effect.void
      const writeWithOutbox = () => Effect.void

      return LocalDb.of({
        getMeta,
        setMeta,
        getOutbox,
        clearOutbox,
        applyChanges,
        applyServerVersion,
        removeFromOutbox,
        writeWithOutbox,
      })
    }),
  ).pipe(
    Layer.provideMerge(Layer.effectDiscard(initSchema)),
    Layer.provideMerge(SqliteTestLayer),
    Layer.provideMerge(BunContext.layer),
    Layer.fresh,
  )

// ============================================
// Tests
// ============================================

describe('ensureSchema', () => {
  describe('fresh database', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('fresh DB gets schema_version set', () =>
        Effect.gen(function* () {
          const local = yield* LocalDb

          // Verify no schema_version initially
          const beforeOpt = yield* local.getMeta('schema_version')
          expect(Option.isNone(beforeOpt)).toBe(true)

          // Run ensureSchema
          yield* ensureSchema

          // Verify schema_version is now set
          const afterOpt = yield* local.getMeta('schema_version')
          expect(Option.isSome(afterOpt)).toBe(true)
          if (Option.isSome(afterOpt)) {
            expect(afterOpt.value).toBe(EMBEDDED_SCHEMA_VERSION)
          }
        }),
      )
    })
  })

  describe('up-to-date database', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('up-to-date DB passes without changes', () =>
        Effect.gen(function* () {
          const local = yield* LocalDb

          // Set schema_version to current
          yield* local.setMeta('schema_version', EMBEDDED_SCHEMA_VERSION)

          // Run ensureSchema - should succeed without error
          yield* ensureSchema

          // Verify schema_version is unchanged
          const versionOpt = yield* local.getMeta('schema_version')
          expect(Option.isSome(versionOpt)).toBe(true)
          if (Option.isSome(versionOpt)) {
            expect(versionOpt.value).toBe(EMBEDDED_SCHEMA_VERSION)
          }
        }),
      )
    })
  })

  describe('older version', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('older version triggers migration and updates version', () =>
        Effect.gen(function* () {
          const local = yield* LocalDb

          // Set schema_version to older version
          yield* local.setMeta('schema_version', '0.9.0')

          // Run ensureSchema - should run migrations
          yield* ensureSchema

          // Verify schema_version is updated to current
          const versionOpt = yield* local.getMeta('schema_version')
          expect(Option.isSome(versionOpt)).toBe(true)
          if (Option.isSome(versionOpt)) {
            expect(versionOpt.value).toBe(EMBEDDED_SCHEMA_VERSION)
          }
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('very old version (0.0.0) triggers migration', () =>
        Effect.gen(function* () {
          const local = yield* LocalDb

          // Set schema_version to very old version
          yield* local.setMeta('schema_version', '0.0.0')

          // Run ensureSchema
          yield* ensureSchema

          // Verify schema_version is updated
          const versionOpt = yield* local.getMeta('schema_version')
          expect(Option.isSome(versionOpt)).toBe(true)
          if (Option.isSome(versionOpt)) {
            expect(versionOpt.value).toBe(EMBEDDED_SCHEMA_VERSION)
          }
        }),
      )
    })
  })

  describe('newer version', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('newer version fails with SchemaVersionError', () =>
        Effect.gen(function* () {
          const local = yield* LocalDb

          // Set schema_version to newer than embedded
          const newerVersion = '99.0.0'
          yield* local.setMeta('schema_version', newerVersion)

          // Run ensureSchema - should fail
          const result = yield* ensureSchema.pipe(Effect.either)

          expect(Either.isLeft(result)).toBe(true)
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe('SchemaVersionError')
            const error = result.left as SchemaVersionError
            expect(error.localVersion).toBe(newerVersion)
            expect(error.requiredVersion).toBe(EMBEDDED_SCHEMA_VERSION)
            expect(error.message).toContain('Please update CLI')
          }
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('minor version ahead fails with SchemaVersionError', () =>
        Effect.gen(function* () {
          const local = yield* LocalDb

          // Set schema_version to minor version ahead (e.g., 1.1.0 vs 1.0.0)
          const newerVersion = '1.1.0'
          yield* local.setMeta('schema_version', newerVersion)

          // Run ensureSchema - should fail
          const result = yield* ensureSchema.pipe(Effect.either)

          expect(Either.isLeft(result)).toBe(true)
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe('SchemaVersionError')
          }
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('patch version ahead fails with SchemaVersionError', () =>
        Effect.gen(function* () {
          const local = yield* LocalDb

          // Set schema_version to patch version ahead (e.g., 1.0.1 vs 1.0.0)
          const newerVersion = '1.0.1'
          yield* local.setMeta('schema_version', newerVersion)

          // Run ensureSchema - should fail
          const result = yield* ensureSchema.pipe(Effect.either)

          expect(Either.isLeft(result)).toBe(true)
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe('SchemaVersionError')
          }
        }),
      )
    })
  })

  describe('idempotency', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('running ensureSchema twice is idempotent', () =>
        Effect.gen(function* () {
          const local = yield* LocalDb

          // Run ensureSchema twice
          yield* ensureSchema
          yield* ensureSchema

          // Verify schema_version is set correctly
          const versionOpt = yield* local.getMeta('schema_version')
          expect(Option.isSome(versionOpt)).toBe(true)
          if (Option.isSome(versionOpt)) {
            expect(versionOpt.value).toBe(EMBEDDED_SCHEMA_VERSION)
          }
        }),
      )
    })
  })
})
