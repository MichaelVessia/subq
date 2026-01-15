import { Schema } from 'effect'

// ============================================
// BetterAuth API Response Schemas
// Used by CLI to decode auth endpoint responses
// ============================================

/**
 * Error response from BetterAuth API.
 * Both fields are optional as error formats may vary.
 */
export const AuthErrorResponse = Schema.Struct({
  message: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
})
export type AuthErrorResponse = typeof AuthErrorResponse.Type

/**
 * Success response from BetterAuth API.
 * Contains user info and optional session data.
 */
export const AuthSuccessResponse = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    name: Schema.optional(Schema.String),
  }),
  session: Schema.optional(
    Schema.Struct({
      token: Schema.String,
    }),
  ),
})
export type AuthSuccessResponse = typeof AuthSuccessResponse.Type
