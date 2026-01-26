/**
 * Unit tests for sync error types.
 * Tests construction, _tag values, and schema validation.
 */
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Either, Schema } from 'effect'
import {
  InvalidTokenError,
  LoginFailedError,
  LoginFailedReason,
  SchemaVersionError,
  SyncAuthError,
  SyncConflictError,
  SyncNetworkError,
} from './sync-errors.js'

describe('SyncNetworkError', () => {
  it.effect('constructs with correct _tag', () =>
    Effect.gen(function* () {
      const error = new SyncNetworkError({ message: 'Connection refused' })
      expect(error._tag).toBe('SyncNetworkError')
      expect(error.message).toBe('Connection refused')
    }),
  )

  it.effect('accepts optional cause', () =>
    Effect.gen(function* () {
      const originalError = new Error('ECONNREFUSED')
      const error = new SyncNetworkError({ message: 'Connection refused', cause: originalError })
      expect(error.cause).toBe(originalError)
    }),
  )

  it.effect('constructs without cause', () =>
    Effect.gen(function* () {
      const error = new SyncNetworkError({ message: 'Timeout' })
      expect(error.cause).toBeUndefined()
    }),
  )
})

describe('SyncAuthError', () => {
  it.effect('constructs with correct _tag', () =>
    Effect.gen(function* () {
      const error = new SyncAuthError({ message: 'Token expired' })
      expect(error._tag).toBe('SyncAuthError')
      expect(error.message).toBe('Token expired')
    }),
  )
})

describe('SyncConflictError', () => {
  it.effect('constructs with correct _tag', () =>
    Effect.gen(function* () {
      const error = new SyncConflictError({
        message: 'Conflicts detected',
        conflicts: [],
      })
      expect(error._tag).toBe('SyncConflictError')
      expect(error.message).toBe('Conflicts detected')
    }),
  )

  it.effect('holds conflicts array', () =>
    Effect.gen(function* () {
      const conflicts = [
        { id: 'row-1', serverVersion: { weight: 150 } },
        { id: 'row-2', serverVersion: { weight: 155 } },
      ]
      const error = new SyncConflictError({
        message: '2 conflicts detected',
        conflicts,
      })
      expect(error.conflicts.length).toBe(2)
      expect(error.conflicts[0]?.id).toBe('row-1')
      expect(error.conflicts[1]?.id).toBe('row-2')
    }),
  )

  it.effect('preserves serverVersion data in conflicts', () =>
    Effect.gen(function* () {
      const conflicts = [{ id: 'row-1', serverVersion: { weight: 160, updatedAt: '2024-01-15T10:00:00Z' } }]
      const error = new SyncConflictError({
        message: 'Conflict',
        conflicts,
      })
      expect(error.conflicts[0]?.serverVersion).toEqual({ weight: 160, updatedAt: '2024-01-15T10:00:00Z' })
    }),
  )
})

describe('InvalidTokenError', () => {
  it.effect('constructs with correct _tag', () =>
    Effect.gen(function* () {
      const error = new InvalidTokenError({ message: 'Invalid CLI token' })
      expect(error._tag).toBe('InvalidTokenError')
      expect(error.message).toBe('Invalid CLI token')
    }),
  )
})

describe('LoginFailedError', () => {
  it.effect('constructs with correct _tag', () =>
    Effect.gen(function* () {
      const error = new LoginFailedError({ reason: 'invalid_credentials', message: 'Wrong password' })
      expect(error._tag).toBe('LoginFailedError')
      expect(error.reason).toBe('invalid_credentials')
      expect(error.message).toBe('Wrong password')
    }),
  )

  it.effect('accepts account_locked reason', () =>
    Effect.gen(function* () {
      const error = new LoginFailedError({ reason: 'account_locked', message: 'Account is locked' })
      expect(error.reason).toBe('account_locked')
    }),
  )

  it.effect('accepts network_error reason', () =>
    Effect.gen(function* () {
      const error = new LoginFailedError({ reason: 'network_error', message: 'Could not reach server' })
      expect(error.reason).toBe('network_error')
    }),
  )

  it.effect('rejects invalid reason via schema decode', () =>
    Effect.gen(function* () {
      const result = Schema.decodeUnknownEither(LoginFailedReason)('invalid_reason')
      expect(Either.isLeft(result)).toBe(true)
    }),
  )

  it.effect('validates reason with schema', () =>
    Effect.gen(function* () {
      const validReasons = ['invalid_credentials', 'account_locked', 'network_error']
      for (const reason of validReasons) {
        const result = Schema.decodeUnknownEither(LoginFailedReason)(reason)
        expect(Either.isRight(result)).toBe(true)
      }
    }),
  )
})

describe('SchemaVersionError', () => {
  it.effect('constructs with correct _tag', () =>
    Effect.gen(function* () {
      const error = new SchemaVersionError({
        localVersion: '1.0.0',
        requiredVersion: '2.0.0',
        message: 'Please update CLI',
      })
      expect(error._tag).toBe('SchemaVersionError')
      expect(error.localVersion).toBe('1.0.0')
      expect(error.requiredVersion).toBe('2.0.0')
      expect(error.message).toBe('Please update CLI')
    }),
  )

  it.effect('holds version information', () =>
    Effect.gen(function* () {
      const error = new SchemaVersionError({
        localVersion: '3.2.1',
        requiredVersion: '3.0.0',
        message: 'Your local DB is newer',
      })
      expect(error.localVersion).toBe('3.2.1')
      expect(error.requiredVersion).toBe('3.0.0')
    }),
  )
})
