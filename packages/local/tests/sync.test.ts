/**
 * Tests for sync function.
 * Uses it.layer pattern with mocked RemoteClient for test isolation.
 */
import { FileSystem, Path } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import type { PullResponse, PushResponse, SyncChange, SyncConflict } from '@subq/shared'
import { SyncNetworkError } from '@subq/shared'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Context, Effect, Either, Layer, Option, Ref } from 'effect'
import { LocalDb } from '../src/services/LocalDb.js'
import { RemoteClient, type RemoteClientService } from '../src/services/RemoteClient.js'
import { sync, type SyncError } from '../src/sync.js'

// ============================================
// Mock State Service (to share Ref between tests and mock)
// ============================================

interface MockPullCall {
  cursor: string
  limit: number | undefined
}

interface MockPushCall {
  changes: ReadonlyArray<SyncChange>
}

interface MockRemoteState {
  pullCalls: Array<MockPullCall>
  pushCalls: Array<MockPushCall>
  pullResponses: Array<PullResponse>
  pushResponses: Array<PushResponse>
  pullError: SyncError | null
  pushError: SyncError | null
}

class MockState extends Context.Tag('@test/MockState')<MockState, Ref.Ref<MockRemoteState>>() {}

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

  const schemaPath = path.join(import.meta.dir, '..', 'src', 'db', 'schema.sql')
  const schemaSql = yield* fs.readFileString(schemaPath)

  const withoutComments = schemaSql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  const statements = withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const statement of statements) {
    yield* sql.unsafe(statement)
  }
})

// LocalDb layer using SqlClient
const LocalDbTestLayer = Layer.effect(
  LocalDb,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const getMeta = (key: string) =>
      Effect.gen(function* () {
        const rows = yield* sql<{ value: string }>`
          SELECT value FROM sync_meta WHERE key = ${key}
        `
        if (rows.length === 0) return Option.none<string>()
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
              const existing = yield* sql`
                SELECT id FROM ${sql.literal(change.table)} WHERE id = ${change.id}
              `

              if (existing.length === 0) {
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
)

// Mock RemoteClient layer using MockState
const MockRemoteClientLayer = Layer.effect(
  RemoteClient,
  Effect.gen(function* () {
    const stateRef = yield* MockState

    const pull: RemoteClientService['pull'] = (request) =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef)

        // Check for error first
        if (state.pullError) {
          return yield* Effect.fail(state.pullError)
        }

        // Record the call
        const callIndex = state.pullCalls.length
        yield* Ref.update(stateRef, (s) => ({
          ...s,
          pullCalls: [...s.pullCalls, { cursor: request.cursor, limit: request.limit }],
        }))

        // Return next response
        const response = state.pullResponses[callIndex]
        if (!response) {
          return { changes: [], cursor: request.cursor, hasMore: false }
        }

        return response
      })

    const push: RemoteClientService['push'] = (request) =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef)

        // Check for error first
        if (state.pushError) {
          return yield* Effect.fail(state.pushError)
        }

        // Record the call
        const callIndex = state.pushCalls.length
        yield* Ref.update(stateRef, (s) => ({
          ...s,
          pushCalls: [...s.pushCalls, { changes: request.changes }],
        }))

        // Return next response
        const response = state.pushResponses[callIndex]
        if (!response) {
          // Default: accept all changes
          return { accepted: request.changes.map((c) => c.id), conflicts: [] }
        }

        return response
      })

    const authenticate: RemoteClientService['authenticate'] = () => Effect.succeed({ token: 'mock-token' })

    return RemoteClient.of({ pull, push, authenticate })
  }),
)

// MockState layer factory
const makeMockStateLayer = (initialState: MockRemoteState) => Layer.effect(MockState, Ref.make(initialState))

// Factory to create test layer with initial mock state
const makeTestLayer = (initialState: MockRemoteState) => {
  const mockStateLayer = makeMockStateLayer(initialState)

  return Layer.mergeAll(
    LocalDbTestLayer,
    MockRemoteClientLayer.pipe(Layer.provide(mockStateLayer)),
    mockStateLayer,
  ).pipe(
    Layer.provideMerge(Layer.effectDiscard(initSchema)),
    Layer.provideMerge(SqliteTestLayer),
    Layer.provideMerge(BunContext.layer),
    Layer.fresh,
  )
}

// ============================================
// Test Helpers
// ============================================

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

const insertWeightLog = (id: string, weight: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()

    yield* sql`
      INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
      VALUES (${id}, ${now}, ${weight}, NULL, 'user-1', ${now}, ${now})
    `
  })

const getWeightLog = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ id: string; weight: number; notes: string | null }>`
      SELECT id, weight, notes FROM weight_logs WHERE id = ${id}
    `
    return rows.length > 0 ? Option.some(rows[0]) : Option.none()
  })

const getOutboxCount = () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ count: number }>`
      SELECT COUNT(*) as count FROM sync_outbox
    `
    return rows[0].count
  })

const getCursor = () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ value: string }>`
      SELECT value FROM sync_meta WHERE key = 'last_sync_cursor'
    `
    return rows.length > 0 ? Option.some(rows[0].value) : Option.none()
  })

// ============================================
// Tests
// ============================================

describe('sync', () => {
  describe('pull phase', () => {
    it.layer(
      makeTestLayer({
        pullCalls: [],
        pushCalls: [],
        pullResponses: [
          {
            changes: [
              {
                table: 'weight_logs',
                id: 'pulled-row-1',
                operation: 'insert',
                payload: {
                  datetime: '2024-01-15T10:00:00Z',
                  weight: 150.5,
                  notes: 'Pulled from server',
                  user_id: 'user-1',
                  created_at: '2024-01-15T10:00:00Z',
                  updated_at: '2024-01-15T10:00:00Z',
                },
                timestamp: Date.now(),
              },
            ],
            cursor: '2024-01-15T10:00:00Z',
            hasMore: false,
          },
        ],
        pushResponses: [],
        pullError: null,
        pushError: null,
      }),
    )((it) => {
      it.effect('sync pulls and applies changes', () =>
        Effect.gen(function* () {
          yield* sync()

          const row = yield* getWeightLog('pulled-row-1')
          expect(Option.isSome(row)).toBe(true)
          if (Option.isSome(row)) {
            expect(row.value.weight).toBe(150.5)
            expect(row.value.notes).toBe('Pulled from server')
          }
        }),
      )
    })

    it.layer(
      makeTestLayer({
        pullCalls: [],
        pushCalls: [],
        pullResponses: [
          {
            changes: [
              {
                table: 'weight_logs',
                id: 'page-1-row',
                operation: 'insert',
                payload: {
                  datetime: '2024-01-15T10:00:00Z',
                  weight: 150.0,
                  notes: 'Page 1',
                  user_id: 'user-1',
                  created_at: '2024-01-15T10:00:00Z',
                  updated_at: '2024-01-15T10:00:00Z',
                },
                timestamp: Date.now(),
              },
            ],
            cursor: '2024-01-15T10:00:00Z',
            hasMore: true,
          },
          {
            changes: [
              {
                table: 'weight_logs',
                id: 'page-2-row',
                operation: 'insert',
                payload: {
                  datetime: '2024-01-15T11:00:00Z',
                  weight: 151.0,
                  notes: 'Page 2',
                  user_id: 'user-1',
                  created_at: '2024-01-15T11:00:00Z',
                  updated_at: '2024-01-15T11:00:00Z',
                },
                timestamp: Date.now(),
              },
            ],
            cursor: '2024-01-15T11:00:00Z',
            hasMore: false,
          },
        ],
        pushResponses: [],
        pullError: null,
        pushError: null,
      }),
    )((it) => {
      it.effect('sync handles pagination (hasMore=true)', () =>
        Effect.gen(function* () {
          yield* sync()

          // Verify both rows were applied
          const row1 = yield* getWeightLog('page-1-row')
          const row2 = yield* getWeightLog('page-2-row')
          expect(Option.isSome(row1)).toBe(true)
          expect(Option.isSome(row2)).toBe(true)

          // Verify both pages were fetched
          const stateRef = yield* MockState
          const state = yield* Ref.get(stateRef)
          expect(state.pullCalls.length).toBe(2)
          expect(state.pullCalls[0].cursor).toBe('1970-01-01T00:00:00Z')
          expect(state.pullCalls[1].cursor).toBe('2024-01-15T10:00:00Z')
        }),
      )
    })

    it.layer(
      makeTestLayer({
        pullCalls: [],
        pushCalls: [],
        pullResponses: [
          {
            changes: [],
            cursor: '2024-01-20T15:30:00Z',
            hasMore: false,
          },
        ],
        pushResponses: [],
        pullError: null,
        pushError: null,
      }),
    )((it) => {
      it.effect('sync updates cursor after pull', () =>
        Effect.gen(function* () {
          yield* sync()

          const cursor = yield* getCursor()
          expect(Option.isSome(cursor)).toBe(true)
          if (Option.isSome(cursor)) {
            expect(cursor.value).toBe('2024-01-20T15:30:00Z')
          }
        }),
      )
    })
  })

  describe('push phase', () => {
    it.layer(
      makeTestLayer({
        pullCalls: [],
        pushCalls: [],
        pullResponses: [{ changes: [], cursor: '2024-01-15T00:00:00Z', hasMore: false }],
        pushResponses: [{ accepted: ['outbox-row-1', 'outbox-row-2'], conflicts: [] }],
        pullError: null,
        pushError: null,
      }),
    )((it) => {
      it.effect('sync pushes outbox entries', () =>
        Effect.gen(function* () {
          // Add entries to outbox
          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'outbox-row-1',
            operation: 'insert',
            payload: { weight: 150.0 },
            timestamp: Date.now(),
          })

          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'outbox-row-2',
            operation: 'insert',
            payload: { weight: 151.0 },
            timestamp: Date.now(),
          })

          yield* sync()

          // Verify push was called with the outbox entries
          const stateRef = yield* MockState
          const state = yield* Ref.get(stateRef)
          expect(state.pushCalls.length).toBe(1)
          expect(state.pushCalls[0].changes.length).toBe(2)
        }),
      )
    })

    it.layer(
      makeTestLayer({
        pullCalls: [],
        pushCalls: [],
        pullResponses: [{ changes: [], cursor: '2024-01-15T00:00:00Z', hasMore: false }],
        pushResponses: [{ accepted: ['clear-row-1', 'clear-row-2'], conflicts: [] }],
        pullError: null,
        pushError: null,
      }),
    )((it) => {
      it.effect('sync clears accepted from outbox', () =>
        Effect.gen(function* () {
          // Add entries to outbox
          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'clear-row-1',
            operation: 'insert',
            payload: { weight: 150.0 },
            timestamp: Date.now(),
          })

          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'clear-row-2',
            operation: 'insert',
            payload: { weight: 151.0 },
            timestamp: Date.now(),
          })

          // Verify outbox has entries before sync
          const beforeCount = yield* getOutboxCount()
          expect(beforeCount).toBe(2)

          yield* sync()

          // Verify outbox is empty after sync
          const afterCount = yield* getOutboxCount()
          expect(afterCount).toBe(0)
        }),
      )
    })
  })

  describe('conflict resolution', () => {
    it.layer(
      makeTestLayer({
        pullCalls: [],
        pushCalls: [],
        pullResponses: [{ changes: [], cursor: '2024-01-15T00:00:00Z', hasMore: false }],
        pushResponses: [
          {
            accepted: [],
            conflicts: [
              {
                id: 'conflict-row-1',
                serverVersion: {
                  datetime: '2024-01-15T10:00:00Z',
                  weight: 200.0,
                  notes: 'Server wins',
                  user_id: 'user-1',
                  created_at: '2024-01-15T10:00:00Z',
                  updated_at: '2024-01-15T12:00:00Z',
                },
              },
            ],
          },
        ],
        pullError: null,
        pushError: null,
      }),
    )((it) => {
      it.effect('sync resolves conflicts by applying server version', () =>
        Effect.gen(function* () {
          // Insert a local row that will conflict
          yield* insertWeightLog('conflict-row-1', 150.0)

          // Add to outbox (local update attempt)
          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'conflict-row-1',
            operation: 'update',
            payload: { weight: 160.0, notes: 'Local attempt' },
            timestamp: Date.now(),
          })

          yield* sync()

          // Verify server version was applied
          const row = yield* getWeightLog('conflict-row-1')
          expect(Option.isSome(row)).toBe(true)
          if (Option.isSome(row)) {
            expect(row.value.weight).toBe(200.0)
            expect(row.value.notes).toBe('Server wins')
          }

          // Verify outbox entry was removed
          const outboxCount = yield* getOutboxCount()
          expect(outboxCount).toBe(0)
        }),
      )
    })
  })

  describe('transaction rollback', () => {
    it.layer(
      makeTestLayer({
        pullCalls: [],
        pushCalls: [],
        pullResponses: [],
        pushResponses: [],
        pullError: new SyncNetworkError({ message: 'Network failure' }),
        pushError: null,
      }),
    )((it) => {
      it.effect('transaction rolls back on error', () =>
        Effect.gen(function* () {
          // Set initial cursor
          const sql = yield* SqlClient.SqlClient
          yield* sql`INSERT INTO sync_meta (key, value) VALUES ('last_sync_cursor', '2024-01-01T00:00:00Z')`

          // Add an outbox entry
          yield* addToOutbox({
            tableName: 'weight_logs',
            rowId: 'rollback-row-1',
            operation: 'insert',
            payload: { weight: 150.0 },
            timestamp: Date.now(),
          })

          // Sync should fail
          const result = yield* sync().pipe(Effect.either)

          expect(Either.isLeft(result)).toBe(true)
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe('SyncNetworkError')
          }

          // Outbox should still have the entry (not cleared due to rollback)
          const outboxCount = yield* getOutboxCount()
          expect(outboxCount).toBe(1)

          // Cursor should be unchanged
          const cursor = yield* getCursor()
          expect(Option.isSome(cursor)).toBe(true)
          if (Option.isSome(cursor)) {
            expect(cursor.value).toBe('2024-01-01T00:00:00Z')
          }
        }),
      )
    })
  })

  describe('empty scenarios', () => {
    it.layer(
      makeTestLayer({
        pullCalls: [],
        pushCalls: [],
        pullResponses: [{ changes: [], cursor: '2024-01-15T00:00:00Z', hasMore: false }],
        pushResponses: [],
        pullError: null,
        pushError: null,
      }),
    )((it) => {
      it.effect('sync handles empty pull response', () =>
        Effect.gen(function* () {
          yield* sync()

          // Should complete without error
          const stateRef = yield* MockState
          const state = yield* Ref.get(stateRef)
          expect(state.pullCalls.length).toBe(1)
          expect(state.pushCalls.length).toBe(0) // No outbox entries
        }),
      )
    })

    it.layer(
      makeTestLayer({
        pullCalls: [],
        pushCalls: [],
        pullResponses: [{ changes: [], cursor: '2024-01-15T00:00:00Z', hasMore: false }],
        pushResponses: [],
        pullError: null,
        pushError: null,
      }),
    )((it) => {
      it.effect('sync handles empty outbox', () =>
        Effect.gen(function* () {
          yield* sync()

          // Push should not be called when outbox is empty
          const stateRef = yield* MockState
          const state = yield* Ref.get(stateRef)
          expect(state.pushCalls.length).toBe(0)
        }),
      )
    })
  })
})
