/**
 * Tests for LocalDb service.
 * Uses in-memory SQLite with it.layer pattern for test isolation.
 */
import { FileSystem, Path } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import type { SyncChange, SyncConflict } from '@subq/shared'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Clock, Effect, Layer, Option } from 'effect'
import { LocalDb, type WriteWithOutboxOptions } from '../src/services/LocalDb.js'

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

      // Service implementation (simplified for tests - schema already initialized)
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

      const getOutbox = (options: { limit: number }) =>
        Effect.gen(function* () {
          const rows = yield* sql<{
            id: number
            table_name: string
            row_id: string
            operation: string
            payload: string
            timestamp: number
            created_at: string
          }>`
            SELECT id, table_name, row_id, operation, payload, timestamp, created_at
            FROM sync_outbox
            ORDER BY id ASC
            LIMIT ${options.limit}
          `

          return rows.map((row) => ({
            table: row.table_name,
            id: row.row_id,
            operation: row.operation as 'insert' | 'update' | 'delete',
            payload: JSON.parse(row.payload) as Record<string, unknown>,
            timestamp: row.timestamp,
          }))
        })

      const clearOutbox = (ids: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          if (ids.length === 0) return
          const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
          yield* sql.unsafe(`DELETE FROM sync_outbox WHERE row_id IN (${placeholders})`, [...ids]).pipe(Effect.asVoid)
        })

      const applyChanges = (changes: ReadonlyArray<SyncChange>) =>
        Effect.forEach(
          changes,
          (change) =>
            Effect.gen(function* () {
              if (change.operation === 'insert' || change.operation === 'update') {
                // Check if exists
                const existing = yield* sql`
                  SELECT id FROM ${sql.literal(change.table)} WHERE id = ${change.id}
                `

                if (existing.length === 0) {
                  // Insert
                  const columns: Array<string> = ['id']
                  const values: Array<unknown> = [change.id]

                  for (const [key, value] of Object.entries(change.payload)) {
                    if (key === 'id') continue
                    columns.push(key)
                    values.push(value)
                  }

                  const columnsSql = columns.map((c) => `"${c}"`).join(', ')
                  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')

                  yield* sql.unsafe(`INSERT INTO "${change.table}" (${columnsSql}) VALUES (${placeholders})`, values)
                } else {
                  // Update
                  const setClauses: Array<string> = []
                  const values: Array<unknown> = []
                  let paramIndex = 1

                  for (const [key, value] of Object.entries(change.payload)) {
                    if (key === 'id') continue
                    setClauses.push(`"${key}" = $${paramIndex}`)
                    values.push(value)
                    paramIndex++
                  }

                  if (setClauses.length > 0) {
                    values.push(change.id)
                    const setSql = setClauses.join(', ')
                    yield* sql.unsafe(`UPDATE "${change.table}" SET ${setSql} WHERE id = $${paramIndex}`, values)
                  }
                }
              } else if (change.operation === 'delete') {
                // Soft delete
                const deletedAt = (change.payload.deleted_at as string | null) ?? new Date().toISOString()
                const updatedAt = (change.payload.updated_at as string | null) ?? new Date().toISOString()

                yield* sql`
                  UPDATE ${sql.literal(change.table)}
                  SET deleted_at = ${deletedAt}, updated_at = ${updatedAt}
                  WHERE id = ${change.id}
                `
              }
            }),
          { discard: true },
        )

      const applyServerVersion = (conflict: SyncConflict) =>
        Effect.gen(function* () {
          // Find the row in synced tables and update it
          const tables = [
            'weight_logs',
            'injection_logs',
            'glp1_inventory',
            'injection_schedules',
            'schedule_phases',
            'user_goals',
            'user_settings',
          ] as const

          for (const table of tables) {
            const existing = yield* sql`
              SELECT id FROM ${sql.literal(table)} WHERE id = ${conflict.id}
            `

            if (existing.length > 0) {
              // Update the row
              const setClauses: Array<string> = []
              const values: Array<unknown> = []
              let paramIndex = 1

              for (const [key, value] of Object.entries(conflict.serverVersion)) {
                if (key === 'id') continue
                setClauses.push(`"${key}" = $${paramIndex}`)
                values.push(value)
                paramIndex++
              }

              if (setClauses.length > 0) {
                values.push(conflict.id)
                const setSql = setClauses.join(', ')
                yield* sql.unsafe(`UPDATE "${table}" SET ${setSql} WHERE id = $${paramIndex}`, values)
              }
              return
            }
          }
        })

      const removeFromOutbox = (id: string) => sql`DELETE FROM sync_outbox WHERE row_id = ${id}`.pipe(Effect.asVoid)

      const writeWithOutbox = (options: WriteWithOutboxOptions) =>
        Effect.gen(function* () {
          const clock = yield* Clock.Clock
          const timestamp = yield* clock.currentTimeMillis
          const now = new Date(timestamp).toISOString()

          // Perform the database write based on operation type
          if (options.operation === 'insert') {
            // Insert new row
            const columns: Array<string> = ['id']
            const values: Array<unknown> = [options.id]

            for (const [key, value] of Object.entries(options.payload)) {
              if (key === 'id') continue
              columns.push(key)
              values.push(value)
            }

            const columnsSql = columns.map((c) => `"${c}"`).join(', ')
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')

            yield* sql.unsafe(`INSERT INTO "${options.table}" (${columnsSql}) VALUES (${placeholders})`, values)
          } else if (options.operation === 'update') {
            // Update existing row
            const setClauses: Array<string> = []
            const values: Array<unknown> = []
            let paramIndex = 1

            for (const [key, value] of Object.entries(options.payload)) {
              if (key === 'id') continue
              setClauses.push(`"${key}" = $${paramIndex}`)
              values.push(value)
              paramIndex++
            }

            if (setClauses.length > 0) {
              values.push(options.id)
              const setSql = setClauses.join(', ')
              yield* sql.unsafe(`UPDATE "${options.table}" SET ${setSql} WHERE id = $${paramIndex}`, values)
            }
          } else if (options.operation === 'delete') {
            // Soft delete: set deleted_at
            yield* sql`
              UPDATE ${sql.literal(options.table)}
              SET deleted_at = ${now}, updated_at = ${now}
              WHERE id = ${options.id}
            `
          }

          // Build the payload for the outbox entry
          const outboxPayload =
            options.operation === 'delete'
              ? { ...options.payload, deleted_at: now, updated_at: now }
              : { ...options.payload, id: options.id }

          const payloadJson = JSON.stringify(outboxPayload)

          // Add entry to sync_outbox
          yield* sql`
            INSERT INTO sync_outbox (table_name, row_id, operation, payload, timestamp, created_at)
            VALUES (${options.table}, ${options.id}, ${options.operation}, ${payloadJson}, ${timestamp}, ${now})
          `
        })

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

// Helper to add entry to outbox for testing
const addToOutbox = (entry: {
  tableName: string
  rowId: string
  operation: 'insert' | 'update' | 'delete'
  payload: Record<string, unknown>
  timestamp: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    const payloadJson = JSON.stringify(entry.payload)

    yield* sql`
      INSERT INTO sync_outbox (table_name, row_id, operation, payload, timestamp, created_at)
      VALUES (${entry.tableName}, ${entry.rowId}, ${entry.operation}, ${payloadJson}, ${entry.timestamp}, ${now})
    `
  })

// ============================================
// Tests
// ============================================

describe('LocalDb', () => {
  describe('getMeta', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('returns None for missing key', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb
          const result = yield* db.getMeta('nonexistent_key')
          expect(Option.isNone(result)).toBe(true)
        }),
      )
    })
  })

  describe('setMeta and getMeta', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('setMeta then getMeta returns the value', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb

          yield* db.setMeta('test_key', 'test_value')
          const result = yield* db.getMeta('test_key')

          expect(Option.isSome(result)).toBe(true)
          if (Option.isSome(result)) {
            expect(result.value).toBe('test_value')
          }
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('setMeta overwrites existing value', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb

          yield* db.setMeta('overwrite_key', 'first_value')
          yield* db.setMeta('overwrite_key', 'second_value')
          const result = yield* db.getMeta('overwrite_key')

          expect(Option.isSome(result)).toBe(true)
          if (Option.isSome(result)) {
            expect(result.value).toBe('second_value')
          }
        }),
      )
    })
  })

  describe('getOutbox', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('returns empty array initially', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb
          const result = yield* db.getOutbox({ limit: 100 })
          expect(result).toEqual([])
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('returns entries in order by id', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb

          // Add entries to outbox
          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'row-1',
            operation: 'insert',
            payload: { weight: 150 },
            timestamp: 1000,
          })
          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'row-2',
            operation: 'update',
            payload: { weight: 155 },
            timestamp: 2000,
          })

          const result = yield* db.getOutbox({ limit: 100 })

          expect(result.length).toBe(2)
          expect(result[0].id).toBe('row-1')
          expect(result[1].id).toBe('row-2')
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('respects limit parameter', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb

          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'row-1',
            operation: 'insert',
            payload: { weight: 150 },
            timestamp: 1000,
          })
          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'row-2',
            operation: 'insert',
            payload: { weight: 155 },
            timestamp: 2000,
          })
          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'row-3',
            operation: 'insert',
            payload: { weight: 160 },
            timestamp: 3000,
          })

          const result = yield* db.getOutbox({ limit: 2 })

          expect(result.length).toBe(2)
        }),
      )
    })
  })

  describe('clearOutbox', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('removes specified entries', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb

          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'row-1',
            operation: 'insert',
            payload: { weight: 150 },
            timestamp: 1000,
          })
          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'row-2',
            operation: 'insert',
            payload: { weight: 155 },
            timestamp: 2000,
          })
          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'row-3',
            operation: 'insert',
            payload: { weight: 160 },
            timestamp: 3000,
          })

          yield* db.clearOutbox(['row-1', 'row-3'])

          const result = yield* db.getOutbox({ limit: 100 })
          expect(result.length).toBe(1)
          expect(result[0].id).toBe('row-2')
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('handles empty ids array', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb

          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'row-1',
            operation: 'insert',
            payload: { weight: 150 },
            timestamp: 1000,
          })

          yield* db.clearOutbox([])

          const result = yield* db.getOutbox({ limit: 100 })
          expect(result.length).toBe(1)
        }),
      )
    })
  })

  describe('applyChanges', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('inserts new row', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb
          const sql = yield* SqlClient.SqlClient

          const change: SyncChange = {
            table: 'weight_logs',
            id: 'new-weight-1',
            operation: 'insert',
            payload: {
              datetime: '2024-01-15T10:00:00Z',
              weight: 150.5,
              notes: 'Morning weight',
              user_id: 'user-1',
              created_at: '2024-01-15T10:00:00Z',
              updated_at: '2024-01-15T10:00:00Z',
            },
            timestamp: Date.now(),
          }

          yield* db.applyChanges([change])

          const rows = yield* sql<{ id: string; weight: number }>`
            SELECT id, weight FROM weight_logs WHERE id = 'new-weight-1'
          `

          expect(rows.length).toBe(1)
          expect(rows[0].weight).toBe(150.5)
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('updates existing row', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb
          const sql = yield* SqlClient.SqlClient

          // First insert
          const insertChange: SyncChange = {
            table: 'weight_logs',
            id: 'update-weight-1',
            operation: 'insert',
            payload: {
              datetime: '2024-01-15T10:00:00Z',
              weight: 150.0,
              notes: null,
              user_id: 'user-1',
              created_at: '2024-01-15T10:00:00Z',
              updated_at: '2024-01-15T10:00:00Z',
            },
            timestamp: Date.now(),
          }
          yield* db.applyChanges([insertChange])

          // Then update
          const updateChange: SyncChange = {
            table: 'weight_logs',
            id: 'update-weight-1',
            operation: 'update',
            payload: {
              datetime: '2024-01-15T10:00:00Z',
              weight: 155.0,
              notes: 'Updated weight',
              user_id: 'user-1',
              created_at: '2024-01-15T10:00:00Z',
              updated_at: '2024-01-15T11:00:00Z',
            },
            timestamp: Date.now(),
          }
          yield* db.applyChanges([updateChange])

          const rows = yield* sql<{ weight: number; notes: string | null }>`
            SELECT weight, notes FROM weight_logs WHERE id = 'update-weight-1'
          `

          expect(rows.length).toBe(1)
          expect(rows[0].weight).toBe(155.0)
          expect(rows[0].notes).toBe('Updated weight')
        }),
      )
    })

    it.layer(makeTestLayer())((it) => {
      it.effect('handles delete (soft delete)', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb
          const sql = yield* SqlClient.SqlClient

          // First insert
          const insertChange: SyncChange = {
            table: 'weight_logs',
            id: 'delete-weight-1',
            operation: 'insert',
            payload: {
              datetime: '2024-01-15T10:00:00Z',
              weight: 150.0,
              notes: null,
              user_id: 'user-1',
              created_at: '2024-01-15T10:00:00Z',
              updated_at: '2024-01-15T10:00:00Z',
            },
            timestamp: Date.now(),
          }
          yield* db.applyChanges([insertChange])

          // Then soft delete
          const deleteChange: SyncChange = {
            table: 'weight_logs',
            id: 'delete-weight-1',
            operation: 'delete',
            payload: {
              deleted_at: '2024-01-15T12:00:00Z',
              updated_at: '2024-01-15T12:00:00Z',
            },
            timestamp: Date.now(),
          }
          yield* db.applyChanges([deleteChange])

          const rows = yield* sql<{ deleted_at: string | null }>`
            SELECT deleted_at FROM weight_logs WHERE id = 'delete-weight-1'
          `

          expect(rows.length).toBe(1)
          expect(rows[0].deleted_at).toBe('2024-01-15T12:00:00Z')
        }),
      )
    })
  })

  describe('applyServerVersion', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('overwrites local row with server version', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb
          const sql = yield* SqlClient.SqlClient

          // First insert a row
          const insertChange: SyncChange = {
            table: 'weight_logs',
            id: 'conflict-weight-1',
            operation: 'insert',
            payload: {
              datetime: '2024-01-15T10:00:00Z',
              weight: 150.0,
              notes: 'Local version',
              user_id: 'user-1',
              created_at: '2024-01-15T10:00:00Z',
              updated_at: '2024-01-15T10:00:00Z',
            },
            timestamp: Date.now(),
          }
          yield* db.applyChanges([insertChange])

          // Apply server version (conflict resolution)
          const conflict: SyncConflict = {
            id: 'conflict-weight-1',
            serverVersion: {
              datetime: '2024-01-15T10:00:00Z',
              weight: 160.0,
              notes: 'Server version wins',
              user_id: 'user-1',
              created_at: '2024-01-15T10:00:00Z',
              updated_at: '2024-01-15T11:00:00Z',
            },
          }
          yield* db.applyServerVersion(conflict)

          const rows = yield* sql<{ weight: number; notes: string }>`
            SELECT weight, notes FROM weight_logs WHERE id = 'conflict-weight-1'
          `

          expect(rows.length).toBe(1)
          expect(rows[0].weight).toBe(160.0)
          expect(rows[0].notes).toBe('Server version wins')
        }),
      )
    })
  })

  describe('removeFromOutbox', () => {
    it.layer(makeTestLayer())((it) => {
      it.effect('removes single entry by row_id', () =>
        Effect.gen(function* () {
          const db = yield* LocalDb

          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'remove-row-1',
            operation: 'insert',
            payload: { weight: 150 },
            timestamp: 1000,
          })
          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'remove-row-2',
            operation: 'insert',
            payload: { weight: 155 },
            timestamp: 2000,
          })

          yield* db.removeFromOutbox('remove-row-1')

          const result = yield* db.getOutbox({ limit: 100 })
          expect(result.length).toBe(1)
          expect(result[0].id).toBe('remove-row-2')
        }),
      )
    })
  })

  describe('writeWithOutbox', () => {
    describe('insert operations', () => {
      it.layer(makeTestLayer())((it) => {
        it.effect('insert creates outbox entry with operation=insert', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'outbox-insert-1',
              operation: 'insert',
              payload: {
                datetime: '2024-01-15T10:00:00Z',
                weight: 150.5,
                notes: 'Test insert',
                user_id: 'user-1',
                created_at: '2024-01-15T10:00:00Z',
                updated_at: '2024-01-15T10:00:00Z',
              },
            })

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(1)
            expect(outbox[0].operation).toBe('insert')
            expect(outbox[0].table).toBe('weight_logs')
            expect(outbox[0].id).toBe('outbox-insert-1')
          }),
        )
      })

      it.layer(makeTestLayer())((it) => {
        it.effect('insert writes row to database', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb
            const sql = yield* SqlClient.SqlClient

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'outbox-insert-2',
              operation: 'insert',
              payload: {
                datetime: '2024-01-15T10:00:00Z',
                weight: 155.0,
                notes: 'Check database',
                user_id: 'user-1',
                created_at: '2024-01-15T10:00:00Z',
                updated_at: '2024-01-15T10:00:00Z',
              },
            })

            const rows = yield* sql<{ id: string; weight: number; notes: string }>`
              SELECT id, weight, notes FROM weight_logs WHERE id = 'outbox-insert-2'
            `

            expect(rows.length).toBe(1)
            expect(rows[0].weight).toBe(155.0)
            expect(rows[0].notes).toBe('Check database')
          }),
        )
      })
    })

    describe('update operations', () => {
      it.layer(makeTestLayer())((it) => {
        it.effect('update creates outbox entry with operation=update', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb
            const sql = yield* SqlClient.SqlClient

            // First insert directly to database
            yield* sql`
              INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
              VALUES ('outbox-update-1', '2024-01-15T10:00:00Z', 150.0, 'Initial', 'user-1', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
            `

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'outbox-update-1',
              operation: 'update',
              payload: {
                weight: 155.0,
                notes: 'Updated',
                updated_at: '2024-01-15T11:00:00Z',
              },
            })

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(1)
            expect(outbox[0].operation).toBe('update')
            expect(outbox[0].table).toBe('weight_logs')
            expect(outbox[0].id).toBe('outbox-update-1')
          }),
        )
      })

      it.layer(makeTestLayer())((it) => {
        it.effect('update modifies row in database', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb
            const sql = yield* SqlClient.SqlClient

            // First insert directly
            yield* sql`
              INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
              VALUES ('outbox-update-2', '2024-01-15T10:00:00Z', 150.0, 'Initial', 'user-1', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
            `

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'outbox-update-2',
              operation: 'update',
              payload: {
                weight: 160.0,
                notes: 'Modified weight',
                updated_at: '2024-01-15T11:00:00Z',
              },
            })

            const rows = yield* sql<{ weight: number; notes: string }>`
              SELECT weight, notes FROM weight_logs WHERE id = 'outbox-update-2'
            `

            expect(rows.length).toBe(1)
            expect(rows[0].weight).toBe(160.0)
            expect(rows[0].notes).toBe('Modified weight')
          }),
        )
      })
    })

    describe('delete operations', () => {
      it.layer(makeTestLayer())((it) => {
        it.effect('delete creates outbox entry with operation=delete', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb
            const sql = yield* SqlClient.SqlClient

            // First insert directly
            yield* sql`
              INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
              VALUES ('outbox-delete-1', '2024-01-15T10:00:00Z', 150.0, 'To delete', 'user-1', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
            `

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'outbox-delete-1',
              operation: 'delete',
              payload: {},
            })

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(1)
            expect(outbox[0].operation).toBe('delete')
            expect(outbox[0].table).toBe('weight_logs')
            expect(outbox[0].id).toBe('outbox-delete-1')
          }),
        )
      })

      it.layer(makeTestLayer())((it) => {
        it.effect('delete sets deleted_at on row', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb
            const sql = yield* SqlClient.SqlClient

            // First insert directly
            yield* sql`
              INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
              VALUES ('outbox-delete-2', '2024-01-15T10:00:00Z', 150.0, 'To delete', 'user-1', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
            `

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'outbox-delete-2',
              operation: 'delete',
              payload: {},
            })

            const rows = yield* sql<{ deleted_at: string | null }>`
              SELECT deleted_at FROM weight_logs WHERE id = 'outbox-delete-2'
            `

            expect(rows.length).toBe(1)
            expect(rows[0].deleted_at).not.toBeNull()
          }),
        )
      })

      it.layer(makeTestLayer())((it) => {
        it.effect('delete outbox payload contains deleted_at', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb
            const sql = yield* SqlClient.SqlClient

            // First insert directly
            yield* sql`
              INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
              VALUES ('outbox-delete-3', '2024-01-15T10:00:00Z', 150.0, 'To delete', 'user-1', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
            `

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'outbox-delete-3',
              operation: 'delete',
              payload: {},
            })

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(1)
            expect(outbox[0].payload.deleted_at).toBeDefined()
            expect(outbox[0].payload.updated_at).toBeDefined()
          }),
        )
      })
    })

    describe('payload and timestamp', () => {
      it.layer(makeTestLayer())((it) => {
        it.effect('outbox payload matches row data for insert', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb

            const payload = {
              datetime: '2024-01-15T10:00:00Z',
              weight: 150.5,
              notes: 'Payload test',
              user_id: 'user-1',
              created_at: '2024-01-15T10:00:00Z',
              updated_at: '2024-01-15T10:00:00Z',
            }

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'outbox-payload-1',
              operation: 'insert',
              payload,
            })

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(1)
            expect(outbox[0].payload.id).toBe('outbox-payload-1')
            expect(outbox[0].payload.datetime).toBe('2024-01-15T10:00:00Z')
            expect(outbox[0].payload.weight).toBe(150.5)
            expect(outbox[0].payload.notes).toBe('Payload test')
            expect(outbox[0].payload.user_id).toBe('user-1')
          }),
        )
      })

      it.layer(makeTestLayer())((it) => {
        it.effect('outbox timestamp is Unix ms', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb
            const beforeMs = Date.now()

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'outbox-timestamp-1',
              operation: 'insert',
              payload: {
                datetime: '2024-01-15T10:00:00Z',
                weight: 150.5,
                notes: null,
                user_id: 'user-1',
                created_at: '2024-01-15T10:00:00Z',
                updated_at: '2024-01-15T10:00:00Z',
              },
            })

            const afterMs = Date.now()

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(1)
            // Timestamp should be within the time window (reasonable = within 1s)
            expect(outbox[0].timestamp).toBeGreaterThanOrEqual(beforeMs)
            expect(outbox[0].timestamp).toBeLessThanOrEqual(afterMs + 1000)
          }),
        )
      })

      it.layer(makeTestLayer())((it) => {
        it.effect('outbox timestamp is reasonable (within 1s of now)', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb
            const now = Date.now()

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'outbox-timestamp-2',
              operation: 'insert',
              payload: {
                datetime: '2024-01-15T10:00:00Z',
                weight: 150.5,
                notes: null,
                user_id: 'user-1',
                created_at: '2024-01-15T10:00:00Z',
                updated_at: '2024-01-15T10:00:00Z',
              },
            })

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(1)
            const diff = Math.abs(outbox[0].timestamp - now)
            expect(diff).toBeLessThan(1000)
          }),
        )
      })
    })

    describe('additional test cases', () => {
      it.layer(makeTestLayer())((it) => {
        it.effect('multiple writes create multiple outbox entries', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'multi-1',
              operation: 'insert',
              payload: {
                datetime: '2024-01-15T10:00:00Z',
                weight: 150.0,
                notes: null,
                user_id: 'user-1',
                created_at: '2024-01-15T10:00:00Z',
                updated_at: '2024-01-15T10:00:00Z',
              },
            })

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'multi-2',
              operation: 'insert',
              payload: {
                datetime: '2024-01-15T11:00:00Z',
                weight: 151.0,
                notes: null,
                user_id: 'user-1',
                created_at: '2024-01-15T11:00:00Z',
                updated_at: '2024-01-15T11:00:00Z',
              },
            })

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(2)
          }),
        )
      })

      it.layer(makeTestLayer())((it) => {
        it.effect('works with different synced tables', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb

            yield* db.writeWithOutbox({
              table: 'user_goals',
              id: 'goal-1',
              operation: 'insert',
              payload: {
                user_id: 'user-1',
                goal_weight: 140.0,
                starting_weight: 160.0,
                starting_date: '2024-01-01',
                target_date: '2024-06-01',
                notes: null,
                is_active: 1,
                completed_at: null,
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
              },
            })

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(1)
            expect(outbox[0].table).toBe('user_goals')
          }),
        )
      })

      it.layer(makeTestLayer())((it) => {
        it.effect('insert then update creates two outbox entries', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'insert-update-1',
              operation: 'insert',
              payload: {
                datetime: '2024-01-15T10:00:00Z',
                weight: 150.0,
                notes: null,
                user_id: 'user-1',
                created_at: '2024-01-15T10:00:00Z',
                updated_at: '2024-01-15T10:00:00Z',
              },
            })

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'insert-update-1',
              operation: 'update',
              payload: {
                weight: 155.0,
                updated_at: '2024-01-15T11:00:00Z',
              },
            })

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(2)
            expect(outbox[0].operation).toBe('insert')
            expect(outbox[1].operation).toBe('update')
          }),
        )
      })

      it.layer(makeTestLayer())((it) => {
        it.effect('insert then delete creates two outbox entries', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'insert-delete-1',
              operation: 'insert',
              payload: {
                datetime: '2024-01-15T10:00:00Z',
                weight: 150.0,
                notes: null,
                user_id: 'user-1',
                created_at: '2024-01-15T10:00:00Z',
                updated_at: '2024-01-15T10:00:00Z',
              },
            })

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'insert-delete-1',
              operation: 'delete',
              payload: {},
            })

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(2)
            expect(outbox[0].operation).toBe('insert')
            expect(outbox[1].operation).toBe('delete')
          }),
        )
      })

      it.layer(makeTestLayer())((it) => {
        it.effect('outbox entries have sequential ids', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb
            const sql = yield* SqlClient.SqlClient

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'seq-1',
              operation: 'insert',
              payload: {
                datetime: '2024-01-15T10:00:00Z',
                weight: 150.0,
                notes: null,
                user_id: 'user-1',
                created_at: '2024-01-15T10:00:00Z',
                updated_at: '2024-01-15T10:00:00Z',
              },
            })

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'seq-2',
              operation: 'insert',
              payload: {
                datetime: '2024-01-15T11:00:00Z',
                weight: 151.0,
                notes: null,
                user_id: 'user-1',
                created_at: '2024-01-15T11:00:00Z',
                updated_at: '2024-01-15T11:00:00Z',
              },
            })

            const rows = yield* sql<{ id: number }>`
              SELECT id FROM sync_outbox ORDER BY id ASC
            `

            expect(rows.length).toBe(2)
            expect(rows[1].id).toBe(rows[0].id + 1)
          }),
        )
      })

      it.layer(makeTestLayer())((it) => {
        it.effect('update payload is stored correctly', () =>
          Effect.gen(function* () {
            const db = yield* LocalDb
            const sql = yield* SqlClient.SqlClient

            // First insert directly
            yield* sql`
              INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
              VALUES ('update-payload-1', '2024-01-15T10:00:00Z', 150.0, 'Initial', 'user-1', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
            `

            const updatePayload = {
              weight: 165.0,
              notes: 'Updated notes',
              updated_at: '2024-01-15T12:00:00Z',
            }

            yield* db.writeWithOutbox({
              table: 'weight_logs',
              id: 'update-payload-1',
              operation: 'update',
              payload: updatePayload,
            })

            const outbox = yield* db.getOutbox({ limit: 100 })
            expect(outbox.length).toBe(1)
            expect(outbox[0].payload.weight).toBe(165.0)
            expect(outbox[0].payload.notes).toBe('Updated notes')
            expect(outbox[0].payload.id).toBe('update-payload-1')
          }),
        )
      })
    })
  })
})
