/**
 * LocalDb Service - Local SQLite operations for sync
 *
 * Provides Effect.Service for local database operations including:
 * - Metadata storage (sync cursor, schema version)
 * - Outbox management (pending changes to push)
 * - Applying changes from server
 * - Conflict resolution (server version overwrites)
 */
import { FileSystem, Path } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { type SyncChange, type SyncConflict } from '@subq/shared'
import { Clock, Context, Effect, Layer, Option, Schema } from 'effect'

// ============================================
// Database Row Schemas
// ============================================

const SyncMetaRow = Schema.Struct({
  key: Schema.String,
  value: Schema.String,
})

const decodeSyncMetaRow = Schema.decodeUnknown(SyncMetaRow)

const OutboxRow = Schema.Struct({
  id: Schema.Number,
  table_name: Schema.String,
  row_id: Schema.String,
  operation: Schema.Literal('insert', 'update', 'delete'),
  payload: Schema.String, // JSON string
  timestamp: Schema.Number,
  created_at: Schema.String,
})

const decodeOutboxRow = Schema.decodeUnknown(OutboxRow)

// Convert outbox row to SyncChange
const outboxRowToSyncChange = (row: typeof OutboxRow.Type): SyncChange => ({
  table: row.table_name,
  id: row.row_id,
  operation: row.operation,
  payload: JSON.parse(row.payload) as Record<string, unknown>,
  timestamp: row.timestamp,
})

// ============================================
// Synced Tables Configuration
// ============================================

const SYNCED_TABLES = [
  'weight_logs',
  'injection_logs',
  'glp1_inventory',
  'injection_schedules',
  'schedule_phases',
  'user_goals',
  'user_settings',
] as const

type SyncedTable = (typeof SYNCED_TABLES)[number]

const isSyncedTable = (table: string): table is SyncedTable => SYNCED_TABLES.includes(table as SyncedTable)

// ============================================
// Write Operation Types
// ============================================

/** Operation type for writeWithOutbox */
export type WriteOperation = 'insert' | 'update' | 'delete'

/** Write options for writeWithOutbox */
export interface WriteWithOutboxOptions {
  /** Table name (must be a synced table) */
  readonly table: SyncedTable
  /** Row ID (UUID) */
  readonly id: string
  /** Operation type */
  readonly operation: WriteOperation
  /** Row payload (full row data for insert/update, partial for delete) */
  readonly payload: Record<string, unknown>
}

// ============================================
// Service Interface
// ============================================

export interface LocalDbService {
  /** Get metadata value by key, returns None if not found */
  readonly getMeta: (key: string) => Effect.Effect<Option.Option<string>>
  /** Set metadata key-value pair (upsert) */
  readonly setMeta: (key: string, value: string) => Effect.Effect<void>
  /** Get pending outbox entries, ordered by id, limited */
  readonly getOutbox: (options: { limit: number }) => Effect.Effect<Array<SyncChange>>
  /** Clear outbox entries by row_id */
  readonly clearOutbox: (ids: ReadonlyArray<string>) => Effect.Effect<void>
  /** Apply changes from server to local database */
  readonly applyChanges: (changes: ReadonlyArray<SyncChange>) => Effect.Effect<void>
  /** Apply server version for conflict resolution (overwrites local) */
  readonly applyServerVersion: (conflict: SyncConflict) => Effect.Effect<void>
  /** Remove single entry from outbox by row_id */
  readonly removeFromOutbox: (id: string) => Effect.Effect<void>
  /**
   * Write to local database and add entry to sync_outbox atomically.
   * Used by CLI/TUI write operations to ensure changes are queued for sync.
   *
   * - Insert: inserts row and adds outbox entry with operation='insert'
   * - Update: updates row and adds outbox entry with operation='update'
   * - Delete: sets deleted_at and adds outbox entry with operation='delete'
   */
  readonly writeWithOutbox: (options: WriteWithOutboxOptions) => Effect.Effect<void, never, Clock.Clock>
}

export class LocalDb extends Context.Tag('@subq/local/LocalDb')<LocalDb, LocalDbService>() {
  /**
   * Create layer with provided SqlClient. Initializes schema on construction.
   * Use this for custom SqlClient configurations (e.g., in-memory for tests).
   */
  static readonly layer = Layer.effect(
    LocalDb,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      // Initialize schema from schema.sql on first use
      yield* initializeSchema(sql, fs, path)

      return LocalDb.of(makeLocalDbService(sql))
    }),
  )

  /**
   * Default layer with file-based SQLite at ~/.subq/data.db.
   * Provides SqlClient, FileSystem, and Path dependencies.
   */
  static readonly Default = Layer.unwrapEffect(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const subqDir = path.join(process.env.HOME ?? '~', '.subq')

      // Ensure directory exists
      const exists = yield* fs.exists(subqDir)
      if (!exists) {
        yield* fs.makeDirectory(subqDir, { recursive: true })
      }

      const dbPath = path.join(subqDir, 'data.db')

      return LocalDb.layer.pipe(Layer.provide(SqliteClient.layer({ filename: dbPath })))
    }),
  ).pipe(Layer.provide(BunContext.layer))
}

// ============================================
// Schema Initialization
// ============================================

const initializeSchema = (
  sql: SqlClient.SqlClient,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    // Check if sync_meta table exists (indicates schema is initialized)
    const tableCheck = yield* sql<{ name: string }>`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'sync_meta'
    `.pipe(Effect.orDie)

    if (tableCheck.length > 0) {
      // Schema already initialized
      return
    }

    // Read schema.sql from package
    const schemaPath = path.join(import.meta.dir, '..', 'db', 'schema.sql')
    const schemaSql = yield* fs.readFileString(schemaPath).pipe(Effect.orDie)

    // Remove comment lines and split by semicolon
    const withoutComments = schemaSql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')

    const statements = withoutComments
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    // Execute each statement
    for (const statement of statements) {
      yield* sql.unsafe(statement).pipe(Effect.orDie)
    }

    yield* Effect.logInfo('LocalDb: Schema initialized')
  }).pipe(Effect.orDie)

// ============================================
// Service Implementation
// ============================================

const makeLocalDbService = (sql: SqlClient.SqlClient): LocalDbService => ({
  getMeta: (key: string) =>
    Effect.gen(function* () {
      const rows = yield* sql`
        SELECT key, value FROM sync_meta WHERE key = ${key}
      `.pipe(Effect.orDie)

      if (rows.length === 0) {
        return Option.none()
      }

      const row = yield* decodeSyncMetaRow(rows[0]).pipe(Effect.orDie)
      return Option.some(row.value)
    }),

  setMeta: (key: string, value: string) =>
    sql`
      INSERT OR REPLACE INTO sync_meta (key, value) VALUES (${key}, ${value})
    `.pipe(Effect.asVoid, Effect.orDie),

  getOutbox: (options: { limit: number }) =>
    Effect.gen(function* () {
      const rows = yield* sql`
        SELECT id, table_name, row_id, operation, payload, timestamp, created_at
        FROM sync_outbox
        ORDER BY id ASC
        LIMIT ${options.limit}
      `.pipe(Effect.orDie)

      const changes: Array<SyncChange> = []
      for (const row of rows) {
        const decoded = yield* decodeOutboxRow(row).pipe(Effect.orDie)
        changes.push(outboxRowToSyncChange(decoded))
      }

      return changes
    }),

  clearOutbox: (ids: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      if (ids.length === 0) return

      // SQLite doesn't support parameterized IN clause directly, so we use unsafe
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
      yield* sql
        .unsafe(`DELETE FROM sync_outbox WHERE row_id IN (${placeholders})`, [...ids])
        .pipe(Effect.asVoid, Effect.orDie)
    }),

  applyChanges: (changes: ReadonlyArray<SyncChange>) =>
    Effect.forEach(changes, (change) => applyChange(sql, change), { discard: true }),

  applyServerVersion: (conflict: SyncConflict) => applyServerVersion(sql, conflict),

  removeFromOutbox: (id: string) => sql`DELETE FROM sync_outbox WHERE row_id = ${id}`.pipe(Effect.asVoid, Effect.orDie),

  writeWithOutbox: (options: WriteWithOutboxOptions) =>
    Effect.gen(function* () {
      const clock = yield* Clock.Clock
      const timestamp = yield* clock.currentTimeMillis
      const now = new Date(timestamp).toISOString()

      // Perform the database write based on operation type
      if (options.operation === 'insert') {
        yield* insertRow(sql, options.table, options.id, options.payload)
      } else if (options.operation === 'update') {
        yield* updateRow(sql, options.table, options.id, options.payload)
      } else if (options.operation === 'delete') {
        // Soft delete: set deleted_at
        yield* sql`
          UPDATE ${sql.literal(options.table)}
          SET deleted_at = ${now}, updated_at = ${now}
          WHERE id = ${options.id}
        `.pipe(Effect.asVoid, Effect.orDie)
      }

      // Build the payload for the outbox entry
      // For insert/update, use the full payload
      // For delete, include deleted_at and updated_at in the payload
      const outboxPayload =
        options.operation === 'delete'
          ? { ...options.payload, deleted_at: now, updated_at: now }
          : { ...options.payload, id: options.id }

      const payloadJson = JSON.stringify(outboxPayload)

      // Add entry to sync_outbox
      yield* sql`
        INSERT INTO sync_outbox (table_name, row_id, operation, payload, timestamp, created_at)
        VALUES (${options.table}, ${options.id}, ${options.operation}, ${payloadJson}, ${timestamp}, ${now})
      `.pipe(Effect.asVoid, Effect.orDie)
    }),
})

// ============================================
// Change Application Logic
// ============================================

/**
 * Apply a single change from server to local database.
 * Handles insert, update, and delete (soft delete) operations.
 */
const applyChange = (sql: SqlClient.SqlClient, change: SyncChange): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    if (!isSyncedTable(change.table)) {
      yield* Effect.logWarning('LocalDb.applyChange: unknown table, skipping').pipe(
        Effect.annotateLogs({ table: change.table, id: change.id }),
      )
      return
    }

    const table = change.table

    if (change.operation === 'insert') {
      yield* upsertRow(sql, table, change.id, change.payload)
    } else if (change.operation === 'update') {
      yield* upsertRow(sql, table, change.id, change.payload)
    } else if (change.operation === 'delete') {
      // Soft delete: set deleted_at
      const deletedAt = (change.payload.deleted_at as string | null) ?? new Date().toISOString()
      const updatedAt = (change.payload.updated_at as string | null) ?? new Date().toISOString()

      yield* sql`
        UPDATE ${sql.literal(table)}
        SET deleted_at = ${deletedAt}, updated_at = ${updatedAt}
        WHERE id = ${change.id}
      `.pipe(Effect.asVoid, Effect.orDie)
    }
  })

/**
 * Upsert a row into a synced table.
 * Inserts if not exists, updates if exists.
 */
const upsertRow = (
  sql: SqlClient.SqlClient,
  table: SyncedTable,
  id: string,
  payload: Record<string, unknown>,
): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    // Check if row exists
    const existing = yield* sql`
      SELECT id FROM ${sql.literal(table)} WHERE id = ${id}
    `.pipe(Effect.orDie)

    if (existing.length === 0) {
      // Insert new row
      yield* insertRow(sql, table, id, payload)
    } else {
      // Update existing row
      yield* updateRow(sql, table, id, payload)
    }
  })

/**
 * Insert a new row into a synced table.
 */
const insertRow = (
  sql: SqlClient.SqlClient,
  table: SyncedTable,
  id: string,
  payload: Record<string, unknown>,
): Effect.Effect<void, never, never> => {
  const columns: Array<string> = ['id']
  const values: Array<unknown> = [id]

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'id') continue // Already added
    columns.push(key)
    values.push(value)
  }

  const columnsSql = columns.map((c) => `"${c}"`).join(', ')
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')

  return sql
    .unsafe(`INSERT INTO "${table}" (${columnsSql}) VALUES (${placeholders})`, values)
    .pipe(Effect.asVoid, Effect.orDie)
}

/**
 * Update an existing row in a synced table.
 */
const updateRow = (
  sql: SqlClient.SqlClient,
  table: SyncedTable,
  id: string,
  payload: Record<string, unknown>,
): Effect.Effect<void, never, never> => {
  const setClauses: Array<string> = []
  const values: Array<unknown> = []
  let paramIndex = 1

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'id') continue // Don't update primary key
    setClauses.push(`"${key}" = $${paramIndex}`)
    values.push(value)
    paramIndex++
  }

  if (setClauses.length === 0) {
    return Effect.void
  }

  // Add id for WHERE clause
  values.push(id)

  const setSql = setClauses.join(', ')

  return sql
    .unsafe(`UPDATE "${table}" SET ${setSql} WHERE id = $${paramIndex}`, values)
    .pipe(Effect.asVoid, Effect.orDie)
}

/**
 * Apply server version for conflict resolution.
 * Completely overwrites local row with server version.
 */
const applyServerVersion = (sql: SqlClient.SqlClient, conflict: SyncConflict): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    const payload = conflict.serverVersion

    // Determine table from payload (we need it from the conflict)
    // The sync protocol should include table info, but for now we need to find it
    // For conflicts returned from push, we know the table from the original change
    // Since SyncConflict doesn't have table, we need to query all tables to find it
    // This is a limitation - in practice, the sync flow should track the table

    // For now, search for the row in all synced tables
    for (const table of SYNCED_TABLES) {
      const existing = yield* sql`
        SELECT id FROM ${sql.literal(table)} WHERE id = ${conflict.id}
      `.pipe(Effect.orDie)

      if (existing.length > 0) {
        // Found the row, update it
        yield* updateRow(sql, table, conflict.id, payload)
        return
      }
    }

    // Row not found in any table, insert into appropriate table
    // We can't determine table from payload alone, so this is a limitation
    // In practice, the conflict should be associated with a known change
    yield* Effect.logWarning('LocalDb.applyServerVersion: row not found in any table').pipe(
      Effect.annotateLogs({ id: conflict.id }),
    )
  })
