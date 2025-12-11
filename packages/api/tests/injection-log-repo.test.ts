import {
  Dosage,
  DrugName,
  DrugSource,
  InjectionLog,
  type InjectionLogBulkAssignSchedule,
  type InjectionLogCreate,
  InjectionLogId,
  type InjectionLogListParams,
  InjectionLogNotFoundError,
  type InjectionLogUpdate,
  InjectionSite,
  Notes,
} from '@subq/shared'
import { DateTime, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { InjectionLogRepo } from '../src/injection/injection-log-repo.js'

// ============================================
// Test Layer for InjectionLogRepo
// ============================================

const InjectionLogRepoTest = Layer.sync(InjectionLogRepo, () => {
  const store = new Map<string, InjectionLog>()
  let counter = 0

  return {
    list: (params: InjectionLogListParams, _userId: string) =>
      Effect.sync(() => {
        const logs = Array.from(store.values())
        let filtered = logs
        if (params.startDate) {
          filtered = filtered.filter((log) => DateTime.greaterThanOrEqualTo(log.datetime, params.startDate!))
        }
        if (params.endDate) {
          filtered = filtered.filter((log) => DateTime.lessThanOrEqualTo(log.datetime, params.endDate!))
        }
        if (params.drug) {
          filtered = filtered.filter((log) => log.drug === params.drug)
        }
        filtered.sort((a, b) => DateTime.toEpochMillis(b.datetime) - DateTime.toEpochMillis(a.datetime))
        return filtered.slice(params.offset, params.offset + params.limit)
      }),

    findById: (id: string) =>
      Effect.sync(() => {
        const log = store.get(id)
        return log ? Option.some(log) : Option.none()
      }),

    create: (data: InjectionLogCreate, _userId: string) =>
      Effect.sync(() => {
        const now = DateTime.unsafeNow()
        const id = InjectionLogId.make(`injection-${counter++}`)
        const log = new InjectionLog({
          id,
          datetime: data.datetime,
          drug: data.drug,
          source: Option.isSome(data.source) ? data.source.value : null,
          dosage: data.dosage,
          injectionSite: Option.isSome(data.injectionSite) ? data.injectionSite.value : null,
          notes: Option.isSome(data.notes) ? data.notes.value : null,
          scheduleId: Option.isSome(data.scheduleId) ? data.scheduleId.value : null,
          createdAt: now,
          updatedAt: now,
        })
        store.set(id, log)
        return log
      }),

    update: (data: InjectionLogUpdate) =>
      Effect.gen(function* () {
        const current = store.get(data.id)
        if (!current) {
          return yield* InjectionLogNotFoundError.make({ id: data.id })
        }
        const updated = new InjectionLog({
          ...current,
          datetime: data.datetime ?? current.datetime,
          drug: data.drug ?? current.drug,
          source: data.source && Option.isSome(data.source) ? data.source.value : current.source,
          dosage: data.dosage ?? current.dosage,
          injectionSite:
            data.injectionSite && Option.isSome(data.injectionSite) ? data.injectionSite.value : current.injectionSite,
          notes: data.notes && Option.isSome(data.notes) ? data.notes.value : current.notes,
          scheduleId: data.scheduleId && Option.isSome(data.scheduleId) ? data.scheduleId.value : current.scheduleId,
          updatedAt: DateTime.unsafeNow(),
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

    getUniqueDrugs: (_userId: string) =>
      Effect.sync(() => {
        const drugs = new Set<string>()
        for (const log of store.values()) {
          drugs.add(log.drug)
        }
        return Array.from(drugs).sort()
      }),

    getUniqueSites: (_userId: string) =>
      Effect.sync(() => {
        const sites = new Set<string>()
        for (const log of store.values()) {
          if (log.injectionSite) {
            sites.add(log.injectionSite)
          }
        }
        return Array.from(sites).sort()
      }),

    getLastSite: (_userId: string) =>
      Effect.sync(() => {
        const logs = Array.from(store.values()).sort(
          (a, b) => DateTime.toEpochMillis(b.datetime) - DateTime.toEpochMillis(a.datetime),
        )
        return logs[0]?.injectionSite ?? null
      }),

    bulkAssignSchedule: (data: InjectionLogBulkAssignSchedule, _userId: string) =>
      Effect.sync(() => {
        let count = 0
        for (const id of data.ids) {
          const log = store.get(id)
          if (log) {
            const updated = new InjectionLog({
              ...log,
              scheduleId: data.scheduleId,
              updatedAt: DateTime.unsafeNow(),
            })
            store.set(id, updated)
            count++
          }
        }
        return count
      }),

    listBySchedule: (scheduleId: string, _userId: string) =>
      Effect.sync(() => {
        const logs = Array.from(store.values()).filter((log) => log.scheduleId === scheduleId)
        return logs.sort((a, b) => DateTime.toEpochMillis(a.datetime) - DateTime.toEpochMillis(b.datetime))
      }),
  }
})

// ============================================
// Tests
// ============================================

describe('InjectionLogRepo', () => {
  it.effect('creates an injection log entry', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo

      const created = yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
          drug: DrugName.make('Testosterone Cypionate'),
          source: Option.some(DrugSource.make('Empower Pharmacy')),
          dosage: Dosage.make('200mg'),
          injectionSite: Option.some(InjectionSite.make('left ventrogluteal')),
          notes: Option.some(Notes.make('No PIP')),
          scheduleId: Option.none(),
        },
        'user-123',
      )

      expect(created.drug).toBe('Testosterone Cypionate')
      expect(created.dosage).toBe('200mg')
      expect(created.source).toBe('Empower Pharmacy')
      expect(created.injectionSite).toBe('left ventrogluteal')
      expect(created.notes).toBe('No PIP')
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('creates entry with null optional fields', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo

      const created = yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
          drug: DrugName.make('BPC-157'),
          source: Option.none(),
          dosage: Dosage.make('250mcg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )

      expect(created.drug).toBe('BPC-157')
      expect(created.source).toBeNull()
      expect(created.injectionSite).toBeNull()
      expect(created.notes).toBeNull()
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('finds an injection log by id', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo

      const created = yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
          drug: DrugName.make('HCG'),
          source: Option.none(),
          dosage: Dosage.make('500IU'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )

      const found = yield* repo.findById(created.id)
      expect(Option.isSome(found)).toBe(true)
      if (Option.isSome(found)) {
        expect(found.value.id).toBe(created.id)
        expect(found.value.drug).toBe('HCG')
      }
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('returns none for non-existent id', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo
      const found = yield* repo.findById('non-existent')
      expect(Option.isNone(found)).toBe(true)
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('lists injection logs with pagination', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo

      for (let i = 0; i < 5; i++) {
        yield* repo.create(
          {
            datetime: DateTime.unsafeMake(`2024-01-${15 + i}T10:00:00Z`),
            drug: DrugName.make('Testosterone Cypionate'),
            source: Option.none(),
            dosage: Dosage.make(`${100 + i * 10}mg`),
            injectionSite: Option.none(),
            notes: Option.none(),
            scheduleId: Option.none(),
          },
          'user-123',
        )
      }

      const page1 = yield* repo.list({ limit: 2 as any, offset: 0 as any }, 'user-123')
      expect(page1.length).toBe(2)
      // Sorted by datetime DESC
      expect(page1[0]!.dosage).toBe('140mg') // Jan 19
      expect(page1[1]!.dosage).toBe('130mg') // Jan 18
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('filters by drug', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo

      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
          drug: DrugName.make('Testosterone Cypionate'),
          source: Option.none(),
          dosage: Dosage.make('200mg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )
      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-16T10:00:00Z'),
          drug: DrugName.make('BPC-157'),
          source: Option.none(),
          dosage: Dosage.make('250mcg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )
      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-17T10:00:00Z'),
          drug: DrugName.make('Testosterone Cypionate'),
          source: Option.none(),
          dosage: Dosage.make('200mg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )

      const filtered = yield* repo.list(
        { limit: 50 as any, offset: 0 as any, drug: DrugName.make('BPC-157') },
        'user-123',
      )

      expect(filtered.length).toBe(1)
      expect(filtered[0]!.drug).toBe('BPC-157')
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('updates an injection log entry', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo

      const created = yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
          drug: DrugName.make('Testosterone Cypionate'),
          source: Option.none(),
          dosage: Dosage.make('200mg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )

      const updated = yield* repo.update({
        id: created.id,
        dosage: Dosage.make('180mg'),
        source: Option.none(),
        injectionSite: Option.some(InjectionSite.make('right deltoid')),
        notes: Option.none(),
        scheduleId: Option.none(),
      })

      expect(updated.dosage).toBe('180mg')
      expect(updated.injectionSite).toBe('right deltoid')
      // Drug should remain unchanged
      expect(updated.drug).toBe('Testosterone Cypionate')
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('deletes an injection log entry', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo

      const created = yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
          drug: DrugName.make('HCG'),
          source: Option.none(),
          dosage: Dosage.make('500IU'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )

      const deleted = yield* repo.delete(created.id)
      expect(deleted).toBe(true)

      const found = yield* repo.findById(created.id)
      expect(Option.isNone(found)).toBe(true)
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('returns false when deleting non-existent entry', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo
      const deleted = yield* repo.delete('non-existent')
      expect(deleted).toBe(false)
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('gets unique drugs', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo

      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
          drug: DrugName.make('Testosterone Cypionate'),
          source: Option.none(),
          dosage: Dosage.make('200mg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )
      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-16T10:00:00Z'),
          drug: DrugName.make('BPC-157'),
          source: Option.none(),
          dosage: Dosage.make('250mcg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )
      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-17T10:00:00Z'),
          drug: DrugName.make('Testosterone Cypionate'),
          source: Option.none(),
          dosage: Dosage.make('200mg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )

      const drugs = yield* repo.getUniqueDrugs('user-123')
      expect(drugs).toEqual(['BPC-157', 'Testosterone Cypionate'])
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('gets unique injection sites', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo

      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
          drug: DrugName.make('Testosterone Cypionate'),
          source: Option.none(),
          dosage: Dosage.make('200mg'),
          injectionSite: Option.some(InjectionSite.make('left ventrogluteal')),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )
      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-16T10:00:00Z'),
          drug: DrugName.make('BPC-157'),
          source: Option.none(),
          dosage: Dosage.make('250mcg'),
          injectionSite: Option.some(InjectionSite.make('abdomen')),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )
      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-17T10:00:00Z'),
          drug: DrugName.make('Testosterone Cypionate'),
          source: Option.none(),
          dosage: Dosage.make('200mg'),
          injectionSite: Option.none(), // null
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )

      const sites = yield* repo.getUniqueSites('user-123')
      expect(sites).toEqual(['abdomen', 'left ventrogluteal'])
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('gets last injection site', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo

      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
          drug: DrugName.make('Testosterone'),
          source: Option.none(),
          dosage: Dosage.make('200mg'),
          injectionSite: Option.some(InjectionSite.make('Left abdomen')),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )
      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-17T10:00:00Z'),
          drug: DrugName.make('Testosterone'),
          source: Option.none(),
          dosage: Dosage.make('200mg'),
          injectionSite: Option.some(InjectionSite.make('Right abdomen')),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )
      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-16T10:00:00Z'),
          drug: DrugName.make('Testosterone'),
          source: Option.none(),
          dosage: Dosage.make('200mg'),
          injectionSite: Option.some(InjectionSite.make('Left thigh')),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )

      const lastSite = yield* repo.getLastSite('user-123')
      // Should return the most recent by datetime (Jan 17 = Right abdomen)
      expect(lastSite).toBe('Right abdomen')
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('returns null when no injection logs exist', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo
      const lastSite = yield* repo.getLastSite('user-123')
      expect(lastSite).toBeNull()
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('lists injection logs by schedule id', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo
      const scheduleId = 'schedule-123'

      // Create logs with and without schedule assignment
      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-01T10:00:00Z'),
          drug: DrugName.make('Test Drug'),
          source: Option.none(),
          dosage: Dosage.make('100mg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.some(scheduleId as any),
        },
        'user-123',
      )
      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-08T10:00:00Z'),
          drug: DrugName.make('Test Drug'),
          source: Option.none(),
          dosage: Dosage.make('100mg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.some(scheduleId as any),
        },
        'user-123',
      )
      // This one has no schedule
      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
          drug: DrugName.make('Test Drug'),
          source: Option.none(),
          dosage: Dosage.make('100mg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.none(),
        },
        'user-123',
      )

      const scheduled = yield* repo.listBySchedule(scheduleId, 'user-123')
      expect(scheduled.length).toBe(2)
      // Should be sorted by datetime ASC
      expect(DateTime.toEpochMillis(scheduled[0]!.datetime)).toBeLessThan(DateTime.toEpochMillis(scheduled[1]!.datetime))
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )

  it.effect('returns empty array when no logs for schedule', () =>
    Effect.gen(function* () {
      const repo = yield* InjectionLogRepo

      yield* repo.create(
        {
          datetime: DateTime.unsafeMake('2024-01-01T10:00:00Z'),
          drug: DrugName.make('Test Drug'),
          source: Option.none(),
          dosage: Dosage.make('100mg'),
          injectionSite: Option.none(),
          notes: Option.none(),
          scheduleId: Option.some('different-schedule' as any),
        },
        'user-123',
      )

      const results = yield* repo.listBySchedule('non-existent-schedule', 'user-123')
      expect(results.length).toBe(0)
    }).pipe(Effect.provide(InjectionLogRepoTest)),
  )
})
