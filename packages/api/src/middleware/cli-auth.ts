/**
 * CLI auth middleware for validating CLI tokens from Authorization header.
 * Separate from web auth middleware to handle CLI-specific token types.
 */
import { SqlClient } from '@effect/sql'
import { InvalidTokenError, UserId } from '@subq/shared'
import { Clock, Effect, Option, Schema } from 'effect'

// ============================================
// Session Schema for CLI Token Lookup
// ============================================

const SessionRow = Schema.Struct({
  user_id: Schema.String,
  id: Schema.String,
})

const decodeSessionRow = Schema.decodeUnknown(SessionRow)

// ============================================
// CLI Auth Middleware
// ============================================

/**
 * Validates CLI token from Authorization header.
 * Updates last_used_at on successful validation.
 *
 * @param token - Bearer token from Authorization header (without "Bearer " prefix)
 * @returns User ID on success
 * @throws InvalidTokenError on invalid or missing token
 */
export const validateCliToken = (token: string): Effect.Effect<UserId, InvalidTokenError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // Look up CLI session by token
    const rows = yield* sql`
      SELECT user_id, id FROM session
      WHERE token = ${token}
        AND type = 'cli'
    `.pipe(Effect.mapError(() => new InvalidTokenError({ message: 'Invalid CLI token' })))

    if (rows.length === 0) {
      return yield* new InvalidTokenError({ message: 'Invalid CLI token' })
    }

    const session = yield* decodeSessionRow(rows[0]).pipe(
      Effect.mapError(() => new InvalidTokenError({ message: 'Invalid CLI token' })),
    )

    // Update last_used_at timestamp using Clock.currentTimeMillis (testable with TestClock)
    const now = yield* Clock.currentTimeMillis
    const nowIso = new Date(now).toISOString()
    yield* sql`
      UPDATE session SET last_used_at = ${nowIso}
      WHERE id = ${session.id}
    `.pipe(Effect.mapError(() => new InvalidTokenError({ message: 'Invalid CLI token' })))

    return UserId.make(session.user_id)
  })

/**
 * Extracts bearer token from Authorization header value.
 * Returns None if header is missing or doesn't start with "Bearer ".
 */
export const extractBearerToken = (authHeader: string | undefined): Option.Option<string> => {
  if (!authHeader) {
    return Option.none()
  }
  if (!authHeader.startsWith('Bearer ')) {
    return Option.none()
  }
  return Option.some(authHeader.slice(7))
}

/**
 * Middleware that validates CLI token from request headers.
 * Combines token extraction and validation.
 *
 * @param authHeader - Value of Authorization header
 * @returns User ID on success
 * @throws InvalidTokenError on invalid or missing token
 */
export const cliAuthMiddleware = (
  authHeader: string | undefined,
): Effect.Effect<UserId, InvalidTokenError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const tokenOption = extractBearerToken(authHeader)

    if (Option.isNone(tokenOption)) {
      return yield* new InvalidTokenError({ message: 'Missing or invalid Authorization header' })
    }

    return yield* validateCliToken(tokenOption.value)
  })
