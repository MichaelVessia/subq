/**
 * Tests for local SQLite schema initialization.
 * Verifies schema.sql executes without error and creates all expected tables.
 */

import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { FileSystem, Path } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'

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

  // Execute each statement (SQLite doesn't support multiple statements in one call)
  const statements = withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const statement of statements) {
    yield* sql.unsafe(statement)
  }
})

// Layer that initializes schema
const SchemaTestLayer = Layer.effectDiscard(initSchema).pipe(
  Layer.provideMerge(SqliteTestLayer),
  Layer.provideMerge(BunContext.layer),
  Layer.fresh,
)

// Helper to get table names
const getTableNames = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const result = yield* sql<{ name: string }>`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `
  return result.map((r) => r.name)
})

// Helper to get column info for a table
const getColumnInfo = (tableName: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const result = yield* sql.unsafe<{ name: string; type: string; notnull: number; pk: number }>(
      `PRAGMA table_info(${tableName})`,
    )
    return result
  })

describe('Local SQLite Schema', () => {
  describe('schema initialization', () => {
    it.layer(SchemaTestLayer)((it) => {
      it.effect('schema.sql executes without error on in-memory SQLite', () =>
        Effect.gen(function* () {
          // If we reach here, schema executed successfully
          const tables = yield* getTableNames
          expect(tables.length).toBeGreaterThan(0)
        }),
      )
    })
  })

  describe('synced tables', () => {
    it.layer(SchemaTestLayer)((it) => {
      it.effect('all expected synced tables exist after schema init', () =>
        Effect.gen(function* () {
          const tables = yield* getTableNames

          const expectedSyncedTables = [
            'weight_logs',
            'injection_logs',
            'glp1_inventory',
            'injection_schedules',
            'schedule_phases',
            'user_goals',
            'user_settings',
          ]

          for (const table of expectedSyncedTables) {
            expect(tables).toContain(table)
          }
        }),
      )
    })

    it.layer(SchemaTestLayer)((it) => {
      it.effect('all synced tables have deleted_at column', () =>
        Effect.gen(function* () {
          const syncedTables = [
            'weight_logs',
            'injection_logs',
            'glp1_inventory',
            'injection_schedules',
            'schedule_phases',
            'user_goals',
            'user_settings',
          ]

          for (const tableName of syncedTables) {
            const columns = yield* getColumnInfo(tableName)
            const columnNames = columns.map((c) => c.name)
            expect(columnNames).toContain('deleted_at')
          }
        }),
      )
    })
  })

  describe('sync_outbox table', () => {
    it.layer(SchemaTestLayer)((it) => {
      it.effect('sync_outbox exists with correct columns', () =>
        Effect.gen(function* () {
          const tables = yield* getTableNames
          expect(tables).toContain('sync_outbox')

          const columns = yield* getColumnInfo('sync_outbox')
          const columnNames = columns.map((c) => c.name)

          // Check all required columns exist
          expect(columnNames).toContain('id')
          expect(columnNames).toContain('table_name')
          expect(columnNames).toContain('row_id')
          expect(columnNames).toContain('operation')
          expect(columnNames).toContain('payload')
          expect(columnNames).toContain('timestamp')
          expect(columnNames).toContain('created_at')
        }),
      )
    })

    it.layer(SchemaTestLayer)((it) => {
      it.effect('sync_outbox id is auto-incrementing primary key', () =>
        Effect.gen(function* () {
          const columns = yield* getColumnInfo('sync_outbox')
          const idColumn = columns.find((c) => c.name === 'id')

          expect(idColumn).toBeDefined()
          expect(idColumn?.pk).toBe(1)
          expect(idColumn?.type.toUpperCase()).toBe('INTEGER')
        }),
      )
    })
  })

  describe('sync_meta table', () => {
    it.layer(SchemaTestLayer)((it) => {
      it.effect('sync_meta exists with correct columns', () =>
        Effect.gen(function* () {
          const tables = yield* getTableNames
          expect(tables).toContain('sync_meta')

          const columns = yield* getColumnInfo('sync_meta')
          const columnNames = columns.map((c) => c.name)

          // Check required columns
          expect(columnNames).toContain('key')
          expect(columnNames).toContain('value')
        }),
      )
    })

    it.layer(SchemaTestLayer)((it) => {
      it.effect('sync_meta key is primary key', () =>
        Effect.gen(function* () {
          const columns = yield* getColumnInfo('sync_meta')
          const keyColumn = columns.find((c) => c.name === 'key')

          expect(keyColumn).toBeDefined()
          expect(keyColumn?.pk).toBe(1)
        }),
      )
    })
  })

  describe('foreign keys', () => {
    it.layer(SchemaTestLayer)((it) => {
      it.effect('schedule_phases references injection_schedules', () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const fkInfo = yield* sql.unsafe<{
            id: number
            seq: number
            table: string
            from: string
            to: string
            on_delete: string
          }>(`PRAGMA foreign_key_list(schedule_phases)`)

          const scheduleFk = fkInfo.find((fk) => fk.table === 'injection_schedules')
          expect(scheduleFk).toBeDefined()
          expect(scheduleFk?.from).toBe('schedule_id')
          expect(scheduleFk?.to).toBe('id')
          expect(scheduleFk?.on_delete).toBe('CASCADE')
        }),
      )
    })

    it.layer(SchemaTestLayer)((it) => {
      it.effect('injection_logs references injection_schedules', () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const fkInfo = yield* sql.unsafe<{
            id: number
            seq: number
            table: string
            from: string
            to: string
            on_delete: string
          }>(`PRAGMA foreign_key_list(injection_logs)`)

          const scheduleFk = fkInfo.find((fk) => fk.table === 'injection_schedules')
          expect(scheduleFk).toBeDefined()
          expect(scheduleFk?.from).toBe('schedule_id')
          expect(scheduleFk?.to).toBe('id')
          expect(scheduleFk?.on_delete).toBe('SET NULL')
        }),
      )
    })
  })
})
