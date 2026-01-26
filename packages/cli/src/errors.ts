import { Schema } from 'effect'

// CLI-specific errors using Schema.TaggedError pattern
// ============================================

/**
 * Error for missing required CLI arguments
 */
export class MissingArgumentError extends Schema.TaggedError<MissingArgumentError>()('MissingArgumentError', {
  argument: Schema.String,
  hint: Schema.optional(Schema.String),
}) {}

/**
 * Error for session parsing/validation failures
 */
export class InvalidSessionError extends Schema.TaggedError<InvalidSessionError>()('InvalidSessionError', {
  message: Schema.String,
}) {}

/**
 * Error when user is not logged in
 */
export class NotLoggedInError extends Schema.TaggedError<NotLoggedInError>()('NotLoggedInError', {
  message: Schema.String,
}) {}
