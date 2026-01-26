import { Schema } from 'effect'

// ============================================
// Sync Protocol Schemas
// ============================================

/**
 * Operation type for sync changes.
 */
export const SyncOperation = Schema.Literal('insert', 'update', 'delete')
export type SyncOperation = typeof SyncOperation.Type

/**
 * A single change to be synced between client and server.
 *
 * @property table - Name of the table being modified
 * @property id - UUID of the affected row
 * @property operation - Type of operation (insert, update, delete)
 * @property payload - JSON snapshot of the row data
 * @property timestamp - Unix milliseconds when the change was made
 */
export const SyncChange = Schema.Struct({
  table: Schema.String,
  id: Schema.String,
  operation: SyncOperation,
  payload: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  timestamp: Schema.Number,
})
export type SyncChange = typeof SyncChange.Type

/**
 * Represents a conflict where the server version differs from the local version.
 *
 * @property id - UUID of the conflicting row
 * @property serverVersion - Current server state of the row
 */
export const SyncConflict = Schema.Struct({
  id: Schema.String,
  serverVersion: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
})
export type SyncConflict = typeof SyncConflict.Type

// ============================================
// Pull (Server -> Client) Schemas
// ============================================

/**
 * Request to pull changes from the server.
 *
 * @property cursor - ISO8601 timestamp cursor for pagination
 * @property limit - Optional limit on number of changes to return (default server-side)
 */
export const PullRequest = Schema.Struct({
  cursor: Schema.String,
  limit: Schema.optional(Schema.Number),
})
export type PullRequest = typeof PullRequest.Type

/**
 * Response containing changes pulled from the server.
 *
 * @property changes - Array of changes since the cursor
 * @property cursor - New cursor for the next pull request
 * @property hasMore - Whether there are more changes to fetch
 */
export const PullResponse = Schema.Struct({
  changes: Schema.Array(SyncChange),
  cursor: Schema.String,
  hasMore: Schema.Boolean,
})
export type PullResponse = typeof PullResponse.Type

// ============================================
// Push (Client -> Server) Schemas
// ============================================

/**
 * Request to push local changes to the server.
 *
 * @property changes - Array of local changes to push
 */
export const PushRequest = Schema.Struct({
  changes: Schema.Array(SyncChange),
})
export type PushRequest = typeof PushRequest.Type

/**
 * Response from pushing changes to the server.
 *
 * @property accepted - Array of row IDs that were accepted
 * @property conflicts - Array of conflicts that need resolution
 */
export const PushResponse = Schema.Struct({
  accepted: Schema.Array(Schema.String),
  conflicts: Schema.Array(SyncConflict),
})
export type PushResponse = typeof PushResponse.Type
