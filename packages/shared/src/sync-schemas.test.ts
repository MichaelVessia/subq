/**
 * Unit tests for sync protocol schemas.
 * Tests encoding/decoding and validation logic.
 */
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Either, Schema } from 'effect'
import { PullRequest, PullResponse, PushRequest, PushResponse, SyncChange, SyncConflict } from './sync-schemas.js'

describe('SyncChange', () => {
  describe('valid inputs', () => {
    it.effect('encodes/decodes valid insert operation', () =>
      Effect.gen(function* () {
        const data = {
          table: 'weight_logs',
          id: '123e4567-e89b-12d3-a456-426614174000',
          operation: 'insert',
          payload: { weight: 150.5, datetime: '2024-01-15T10:30:00Z' },
          timestamp: 1705315800000,
        }
        const result = Schema.decodeUnknownEither(SyncChange)(data)
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.table).toBe('weight_logs')
          expect(result.right.id).toBe('123e4567-e89b-12d3-a456-426614174000')
          expect(result.right.operation).toBe('insert')
          expect(result.right.timestamp).toBe(1705315800000)
        }
      }),
    )

    it.effect('encodes/decodes valid update operation', () =>
      Effect.gen(function* () {
        const data = {
          table: 'injection_logs',
          id: 'abc-123',
          operation: 'update',
          payload: { dosage: '2.5mg', notes: 'updated' },
          timestamp: 1705315900000,
        }
        const result = Schema.decodeUnknownEither(SyncChange)(data)
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.operation).toBe('update')
        }
      }),
    )

    it.effect('encodes/decodes valid delete operation', () =>
      Effect.gen(function* () {
        const data = {
          table: 'user_goals',
          id: 'goal-456',
          operation: 'delete',
          payload: {},
          timestamp: 1705316000000,
        }
        const result = Schema.decodeUnknownEither(SyncChange)(data)
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.operation).toBe('delete')
          expect(result.right.payload).toEqual({})
        }
      }),
    )
  })

  describe('invalid inputs', () => {
    it.effect('rejects invalid operation value', () =>
      Effect.gen(function* () {
        const data = {
          table: 'weight_logs',
          id: '123',
          operation: 'upsert', // invalid
          payload: {},
          timestamp: 1705315800000,
        }
        const result = Schema.decodeUnknownEither(SyncChange)(data)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects missing required fields', () =>
      Effect.gen(function* () {
        const data = {
          table: 'weight_logs',
          // missing id, operation, payload, timestamp
        }
        const result = Schema.decodeUnknownEither(SyncChange)(data)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })
})

describe('SyncConflict', () => {
  it.effect('decodes valid conflict', () =>
    Effect.gen(function* () {
      const data = {
        id: 'conflict-row-id',
        serverVersion: { weight: 160, datetime: '2024-01-16T10:00:00Z' },
      }
      const result = Schema.decodeUnknownEither(SyncConflict)(data)
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.id).toBe('conflict-row-id')
        expect(result.right.serverVersion).toEqual({ weight: 160, datetime: '2024-01-16T10:00:00Z' })
      }
    }),
  )

  it.effect('rejects missing serverVersion', () =>
    Effect.gen(function* () {
      const data = {
        id: 'conflict-row-id',
      }
      const result = Schema.decodeUnknownEither(SyncConflict)(data)
      expect(Either.isLeft(result)).toBe(true)
    }),
  )
})

describe('PullRequest', () => {
  it.effect('decodes request with cursor only', () =>
    Effect.gen(function* () {
      const data = {
        cursor: '2024-01-15T10:30:00Z',
      }
      const result = Schema.decodeUnknownEither(PullRequest)(data)
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.cursor).toBe('2024-01-15T10:30:00Z')
        expect(result.right.limit).toBeUndefined()
      }
    }),
  )

  it.effect('accepts optional limit', () =>
    Effect.gen(function* () {
      const data = {
        cursor: '2024-01-15T10:30:00Z',
        limit: 500,
      }
      const result = Schema.decodeUnknownEither(PullRequest)(data)
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.cursor).toBe('2024-01-15T10:30:00Z')
        expect(result.right.limit).toBe(500)
      }
    }),
  )

  it.effect('rejects missing cursor', () =>
    Effect.gen(function* () {
      const data = {
        limit: 100,
      }
      const result = Schema.decodeUnknownEither(PullRequest)(data)
      expect(Either.isLeft(result)).toBe(true)
    }),
  )
})

describe('PullResponse', () => {
  it.effect('decodes valid response with changes', () =>
    Effect.gen(function* () {
      const data = {
        changes: [
          {
            table: 'weight_logs',
            id: 'abc',
            operation: 'insert',
            payload: { weight: 150 },
            timestamp: 1705315800000,
          },
        ],
        cursor: '2024-01-15T11:00:00Z',
        hasMore: true,
      }
      const result = Schema.decodeUnknownEither(PullResponse)(data)
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.changes.length).toBe(1)
        expect(result.right.cursor).toBe('2024-01-15T11:00:00Z')
        expect(result.right.hasMore).toBe(true)
      }
    }),
  )

  it.effect('decodes response with empty changes', () =>
    Effect.gen(function* () {
      const data = {
        changes: [],
        cursor: '2024-01-15T10:30:00Z',
        hasMore: false,
      }
      const result = Schema.decodeUnknownEither(PullResponse)(data)
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.changes.length).toBe(0)
        expect(result.right.hasMore).toBe(false)
      }
    }),
  )
})

describe('PushRequest', () => {
  it.effect('decodes valid request with changes', () =>
    Effect.gen(function* () {
      const data = {
        changes: [
          {
            table: 'injection_logs',
            id: 'log-1',
            operation: 'insert',
            payload: { dosage: '2.5mg' },
            timestamp: 1705315800000,
          },
          {
            table: 'weight_logs',
            id: 'weight-1',
            operation: 'update',
            payload: { weight: 155 },
            timestamp: 1705315900000,
          },
        ],
      }
      const result = Schema.decodeUnknownEither(PushRequest)(data)
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.changes.length).toBe(2)
      }
    }),
  )

  it.effect('decodes empty changes array', () =>
    Effect.gen(function* () {
      const data = {
        changes: [],
      }
      const result = Schema.decodeUnknownEither(PushRequest)(data)
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.changes.length).toBe(0)
      }
    }),
  )
})

describe('PushResponse', () => {
  it.effect('decodes response with conflicts correctly', () =>
    Effect.gen(function* () {
      const data = {
        accepted: ['row-1', 'row-2'],
        conflicts: [
          {
            id: 'row-3',
            serverVersion: { weight: 160, updatedAt: '2024-01-16T12:00:00Z' },
          },
        ],
      }
      const result = Schema.decodeUnknownEither(PushResponse)(data)
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.accepted).toEqual(['row-1', 'row-2'])
        expect(result.right.conflicts.length).toBe(1)
        expect(result.right.conflicts[0]?.id).toBe('row-3')
        expect(result.right.conflicts[0]?.serverVersion).toEqual({
          weight: 160,
          updatedAt: '2024-01-16T12:00:00Z',
        })
      }
    }),
  )

  it.effect('decodes response with all accepted (no conflicts)', () =>
    Effect.gen(function* () {
      const data = {
        accepted: ['row-1', 'row-2', 'row-3'],
        conflicts: [],
      }
      const result = Schema.decodeUnknownEither(PushResponse)(data)
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.accepted).toEqual(['row-1', 'row-2', 'row-3'])
        expect(result.right.conflicts.length).toBe(0)
      }
    }),
  )

  it.effect('decodes response with all conflicts (none accepted)', () =>
    Effect.gen(function* () {
      const data = {
        accepted: [],
        conflicts: [
          { id: 'row-1', serverVersion: { data: 'server1' } },
          { id: 'row-2', serverVersion: { data: 'server2' } },
        ],
      }
      const result = Schema.decodeUnknownEither(PushResponse)(data)
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(result.right.accepted.length).toBe(0)
        expect(result.right.conflicts.length).toBe(2)
      }
    }),
  )
})
