import {
  Notes,
  Weight,
  WeightLog,
  type WeightLogCreate,
  WeightLogId,
  type WeightLogListParams,
  type WeightLogUpdate,
} from '@scale/shared'
import { Effect, Layer, Option } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { WeightLogRepo } from '../src/weight/WeightLogRepo.js'

// ============================================
// Test Layer for WeightLogRepo
// ============================================

const WeightLogRepoTest = Layer.sync(WeightLogRepo, () => {
  const store = new Map<string, WeightLog>()
  let counter = 0

  return {
    list: (params: WeightLogListParams, _userId: string) =>
      Effect.sync(() => {
        const logs = Array.from(store.values())
        // Apply date filters
        let filtered = logs
        if (params.startDate) {
          filtered = filtered.filter((log) => log.datetime >= params.startDate!)
        }
        if (params.endDate) {
          filtered = filtered.filter((log) => log.datetime <= params.endDate!)
        }
        // Sort by datetime descending
        filtered.sort((a, b) => b.datetime.getTime() - a.datetime.getTime())
        // Apply pagination
        return filtered.slice(params.offset, params.offset + params.limit)
      }),

    findById: (id: string) =>
      Effect.sync(() => {
        const log = store.get(id)
        return log ? Option.some(log) : Option.none()
      }),

    create: (data: WeightLogCreate, _userId: string) =>
      Effect.sync(() => {
        const now = new Date()
        const id = WeightLogId.make(`weight-${counter++}`)
        const log = new WeightLog({
          id,
          datetime: data.datetime,
          weight: data.weight,
          unit: data.unit,
          notes: Option.isSome(data.notes) ? data.notes.value : null,
          createdAt: now,
          updatedAt: now,
        })
        store.set(id, log)
        return log
      }),

    update: (data: WeightLogUpdate) =>
      Effect.gen(function* () {
        const current = store.get(data.id)
        if (!current) {
          return yield* Effect.die(new Error('WeightLog not found'))
        }
        const updated = new WeightLog({
          ...current,
          datetime: data.datetime ?? current.datetime,
          weight: data.weight ?? current.weight,
          unit: data.unit ?? current.unit,
          notes: data.notes !== undefined && Option.isSome(data.notes) ? data.notes.value : current.notes,
          updatedAt: new Date(),
        })
        store.set(data.id, updated)
        return updated
      }),

    delete: (id: string) =>
      Effect.sync(() => {
        const had = store.has(id)
        store.delete(id)
        return had
      }),
  }
})

// ============================================
// Tests
// ============================================

describe('WeightLogRepo', () => {
  it.effect('creates a weight log entry', () =>
    Effect.gen(function* () {
      const repo = yield* WeightLogRepo

      const created = yield* repo.create(
        {
          datetime: new Date('2024-01-15T10:00:00Z'),
          weight: Weight.make(185.5),
          unit: 'lbs',
          notes: Option.some(Notes.make('Morning weigh-in')),
        },
        'user-123',
      )

      expect(created.weight).toBe(185.5)
      expect(created.unit).toBe('lbs')
      expect(created.notes).toBe('Morning weigh-in')
    }).pipe(Effect.provide(WeightLogRepoTest)),
  )

  it.effect('finds a weight log by id', () =>
    Effect.gen(function* () {
      const repo = yield* WeightLogRepo

      const created = yield* repo.create(
        {
          datetime: new Date('2024-01-15T10:00:00Z'),
          weight: Weight.make(180),
          unit: 'lbs',
          notes: Option.none(),
        },
        'user-123',
      )

      const found = yield* repo.findById(created.id)
      expect(Option.isSome(found)).toBe(true)
      if (Option.isSome(found)) {
        expect(found.value.id).toBe(created.id)
        expect(found.value.weight).toBe(180)
      }
    }).pipe(Effect.provide(WeightLogRepoTest)),
  )

  it.effect('returns none for non-existent id', () =>
    Effect.gen(function* () {
      const repo = yield* WeightLogRepo
      const found = yield* repo.findById('non-existent')
      expect(Option.isNone(found)).toBe(true)
    }).pipe(Effect.provide(WeightLogRepoTest)),
  )

  it.effect('lists weight logs with pagination', () =>
    Effect.gen(function* () {
      const repo = yield* WeightLogRepo

      // Create several logs
      for (let i = 0; i < 5; i++) {
        yield* repo.create(
          {
            datetime: new Date(`2024-01-${15 + i}T10:00:00Z`),
            weight: Weight.make(180 + i),
            unit: 'lbs',
            notes: Option.none(),
          },
          'user-123',
        )
      }

      const page1 = yield* repo.list({ limit: 2 as any, offset: 0 as any }, 'user-123')
      expect(page1.length).toBe(2)
      // Should be sorted by datetime DESC, so newest first
      expect(page1[0]!.weight).toBe(184) // Jan 19
      expect(page1[1]!.weight).toBe(183) // Jan 18

      const page2 = yield* repo.list({ limit: 2 as any, offset: 2 as any }, 'user-123')
      expect(page2.length).toBe(2)
    }).pipe(Effect.provide(WeightLogRepoTest)),
  )

  it.effect('updates a weight log entry', () =>
    Effect.gen(function* () {
      const repo = yield* WeightLogRepo

      const created = yield* repo.create(
        {
          datetime: new Date('2024-01-15T10:00:00Z'),
          weight: Weight.make(185),
          unit: 'lbs',
          notes: Option.none(),
        },
        'user-123',
      )

      const updated = yield* repo.update({
        id: created.id,
        weight: Weight.make(184),
        notes: Option.some(Notes.make('After workout')),
      })

      expect(updated.weight).toBe(184)
      expect(updated.notes).toBe('After workout')
      // Unit should remain unchanged
      expect(updated.unit).toBe('lbs')
    }).pipe(Effect.provide(WeightLogRepoTest)),
  )

  it.effect('deletes a weight log entry', () =>
    Effect.gen(function* () {
      const repo = yield* WeightLogRepo

      const created = yield* repo.create(
        {
          datetime: new Date('2024-01-15T10:00:00Z'),
          weight: Weight.make(185),
          unit: 'lbs',
          notes: Option.none(),
        },
        'user-123',
      )

      const deleted = yield* repo.delete(created.id)
      expect(deleted).toBe(true)

      const found = yield* repo.findById(created.id)
      expect(Option.isNone(found)).toBe(true)
    }).pipe(Effect.provide(WeightLogRepoTest)),
  )

  it.effect('returns false when deleting non-existent entry', () =>
    Effect.gen(function* () {
      const repo = yield* WeightLogRepo
      const deleted = yield* repo.delete('non-existent')
      expect(deleted).toBe(false)
    }).pipe(Effect.provide(WeightLogRepoTest)),
  )

  it.effect('filters by date range', () =>
    Effect.gen(function* () {
      const repo = yield* WeightLogRepo

      // Create logs across different dates
      yield* repo.create(
        {
          datetime: new Date('2024-01-10T10:00:00Z'),
          weight: Weight.make(180),
          unit: 'lbs',
          notes: Option.none(),
        },
        'user-123',
      )
      yield* repo.create(
        {
          datetime: new Date('2024-01-15T10:00:00Z'),
          weight: Weight.make(181),
          unit: 'lbs',
          notes: Option.none(),
        },
        'user-123',
      )
      yield* repo.create(
        {
          datetime: new Date('2024-01-20T10:00:00Z'),
          weight: Weight.make(182),
          unit: 'lbs',
          notes: Option.none(),
        },
        'user-123',
      )

      const filtered = yield* repo.list(
        {
          limit: 50 as any,
          offset: 0 as any,
          startDate: new Date('2024-01-12T00:00:00Z'),
          endDate: new Date('2024-01-18T00:00:00Z'),
        },
        'user-123',
      )

      expect(filtered.length).toBe(1)
      expect(filtered[0]!.weight).toBe(181)
    }).pipe(Effect.provide(WeightLogRepoTest)),
  )
})
