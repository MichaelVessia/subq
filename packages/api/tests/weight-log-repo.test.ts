import { Limit, Notes, Offset, Weight, WeightLogId } from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { WeightLogRepo, WeightLogRepoLive } from '../src/weight/weight-log-repo.js'
import { clearTables, insertWeightLog, makeTestLayer, setupTables } from './helpers/test-db.js'

const TestLayer = makeTestLayer(WeightLogRepoLive)

describe('WeightLogRepo', () => {
  describe('create', () => {
    it.effect('creates a weight log entry with all fields', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* WeightLogRepo
        const created = yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            weight: Weight.make(185.5),
            notes: Option.some(Notes.make('Morning weigh-in')),
          },
          'user-123',
        )

        expect(created.weight).toBe(185.5)
        expect(created.notes).toBe('Morning weigh-in')
        expect(created.id).toBeDefined()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('creates a weight log entry without notes', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* WeightLogRepo
        const created = yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            weight: Weight.make(180),
            notes: Option.none(),
          },
          'user-123',
        )

        expect(created.weight).toBe(180)
        expect(created.notes).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('findById', () => {
    it.effect('finds existing entry by id', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* WeightLogRepo
        const created = yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            weight: Weight.make(180),
            notes: Option.none(),
          },
          'user-123',
        )

        const found = yield* repo.findById(created.id, 'user-123')
        expect(Option.isSome(found)).toBe(true)
        if (Option.isSome(found)) {
          expect(found.value.id).toBe(created.id)
          expect(found.value.weight).toBe(180)
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('returns none for non-existent id', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* WeightLogRepo
        const found = yield* repo.findById('non-existent', 'user-123')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('does not find entry belonging to different user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertWeightLog('wl-1', new Date('2024-01-15T10:00:00Z'), 180, 'user-456')

        const repo = yield* WeightLogRepo
        const found = yield* repo.findById('wl-1', 'user-123')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('list', () => {
    it.effect('lists weight logs with pagination', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* WeightLogRepo
        for (let i = 0; i < 5; i++) {
          yield* repo.create(
            {
              datetime: DateTime.unsafeMake(`2024-01-${15 + i}T10:00:00Z`),
              weight: Weight.make(180 + i),
              notes: Option.none(),
            },
            'user-123',
          )
        }

        const page1 = yield* repo.list({ limit: Limit.make(2), offset: Offset.make(0) }, 'user-123')
        expect(page1.length).toBe(2)
        // Should be sorted by datetime DESC, so newest first
        expect(page1[0]!.weight).toBe(184) // Jan 19
        expect(page1[1]!.weight).toBe(183) // Jan 18

        const page2 = yield* repo.list({ limit: Limit.make(2), offset: Offset.make(2) }, 'user-123')
        expect(page2.length).toBe(2)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('filters by date range', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* WeightLogRepo
        yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-10T10:00:00Z'),
            weight: Weight.make(180),
            notes: Option.none(),
          },
          'user-123',
        )
        yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            weight: Weight.make(181),
            notes: Option.none(),
          },
          'user-123',
        )
        yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-20T10:00:00Z'),
            weight: Weight.make(182),
            notes: Option.none(),
          },
          'user-123',
        )

        const filtered = yield* repo.list(
          {
            limit: Limit.make(50),
            offset: Offset.make(0),
            startDate: DateTime.unsafeMake('2024-01-12T00:00:00Z'),
            endDate: DateTime.unsafeMake('2024-01-18T00:00:00Z'),
          },
          'user-123',
        )

        expect(filtered.length).toBe(1)
        expect(filtered[0]!.weight).toBe(181)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('only returns entries for the specified user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertWeightLog('wl-1', new Date('2024-01-15T10:00:00Z'), 180, 'user-123')
        yield* insertWeightLog('wl-2', new Date('2024-01-16T10:00:00Z'), 175, 'user-456')
        yield* insertWeightLog('wl-3', new Date('2024-01-17T10:00:00Z'), 185, 'user-123')

        const repo = yield* WeightLogRepo
        const logs = yield* repo.list({ limit: Limit.make(50), offset: Offset.make(0) }, 'user-123')

        expect(logs.length).toBe(2)
        expect(logs.every((l) => l.id === 'wl-1' || l.id === 'wl-3')).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('update', () => {
    it.effect('updates weight and notes', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* WeightLogRepo
        const created = yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            weight: Weight.make(185),
            notes: Option.none(),
          },
          'user-123',
        )

        const updated = yield* repo.update(
          {
            id: created.id,
            weight: Weight.make(184),
            notes: Option.some(Notes.make('After workout')),
          },
          'user-123',
        )

        expect(updated.weight).toBe(184)
        expect(updated.notes).toBe('After workout')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('fails for non-existent entry', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* WeightLogRepo
        const result = yield* repo
          .update(
            {
              id: WeightLogId.make('non-existent'),
              weight: Weight.make(180),
              notes: Option.none(),
            },
            'user-123',
          )
          .pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('WeightLogNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('cannot update entry belonging to different user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertWeightLog('wl-1', new Date('2024-01-15T10:00:00Z'), 180, 'user-456')

        const repo = yield* WeightLogRepo
        const result = yield* repo
          .update(
            {
              id: WeightLogId.make('wl-1'),
              weight: Weight.make(999),
              notes: Option.none(),
            },
            'user-123',
          )
          .pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('WeightLogNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('delete', () => {
    it.effect('deletes existing entry', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* WeightLogRepo
        const created = yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            weight: Weight.make(185),
            notes: Option.none(),
          },
          'user-123',
        )

        const deleted = yield* repo.delete(created.id, 'user-123')
        expect(deleted).toBe(true)

        const found = yield* repo.findById(created.id, 'user-123')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('returns false for non-existent entry', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* WeightLogRepo
        const deleted = yield* repo.delete('non-existent', 'user-123')
        expect(deleted).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('cannot delete entry belonging to different user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertWeightLog('wl-1', new Date('2024-01-15T10:00:00Z'), 180, 'user-456')

        const repo = yield* WeightLogRepo
        const deleted = yield* repo.delete('wl-1', 'user-123')
        expect(deleted).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
