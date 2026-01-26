import { Schema } from 'effect'
import { SyncConflict } from './sync-schemas.js'

// ============================================
// Sync Error Types
// ============================================

/**
 * Network error during sync operations.
 */
export class SyncNetworkError extends Schema.TaggedError<SyncNetworkError>()('SyncNetworkError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

/**
 * Authentication error during sync (e.g., expired or revoked token).
 */
export class SyncAuthError extends Schema.TaggedError<SyncAuthError>()('SyncAuthError', {
  message: Schema.String,
}) {}

/**
 * Conflict error when server data differs from local changes.
 */
export class SyncConflictError extends Schema.TaggedError<SyncConflictError>()('SyncConflictError', {
  conflicts: Schema.Array(SyncConflict),
  message: Schema.String,
}) {}

/**
 * Error when CLI token is invalid or revoked.
 */
export class InvalidTokenError extends Schema.TaggedError<InvalidTokenError>()('InvalidTokenError', {
  message: Schema.String,
}) {}

/**
 * Reason for login failure.
 */
export const LoginFailedReason = Schema.Literal('invalid_credentials', 'account_locked', 'network_error')
export type LoginFailedReason = typeof LoginFailedReason.Type

/**
 * Error when login fails.
 */
export class LoginFailedError extends Schema.TaggedError<LoginFailedError>()('LoginFailedError', {
  reason: LoginFailedReason,
  message: Schema.String,
}) {}

/**
 * Error when local database schema version is incompatible.
 */
export class SchemaVersionError extends Schema.TaggedError<SchemaVersionError>()('SchemaVersionError', {
  localVersion: Schema.String,
  requiredVersion: Schema.String,
  message: Schema.String,
}) {}

/**
 * Union type for all sync-related errors.
 */
export type SyncError = SyncNetworkError | SyncAuthError | SyncConflictError
