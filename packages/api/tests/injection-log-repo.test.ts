import {
  Dosage,
  DrugName,
  DrugSource,
  InjectionLogId,
  InjectionScheduleId,
  InjectionSite,
  Limit,
  Notes,
  Offset,
} from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { InjectionLogRepo, InjectionLogRepoLive } from '../src/injection/injection-log-repo.js'
import { clearTables, insertInjectionLog, insertSchedule, makeTestLayer, setupTables } from './helpers/test-db.js'

const TestLayer = makeTestLayer(InjectionLogRepoLive)

describe('InjectionLogRepo', () => {
  describe('create', () => {
    it.effect('creates an injection log with all fields', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* InjectionLogRepo
        const created = yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            drug: DrugName.make('Testosterone Cypionate'),
            source: Option.some(DrugSource.make('Empower Pharmacy')),
            dosage: Dosage.make('200mg'),
            injectionSite: Option.some(InjectionSite.make('left ventrogluteal')),
            notes: Option.some(Notes.make('Weekly injection')),
            scheduleId: Option.none(),
          },
          'user-123',
        )

        expect(created.drug).toBe('Testosterone Cypionate')
        expect(created.source).toBe('Empower Pharmacy')
        expect(created.dosage).toBe('200mg')
        expect(created.injectionSite).toBe('left ventrogluteal')
        expect(created.notes).toBe('Weekly injection')
        expect(created.id).toBeDefined()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('creates an injection log with minimal fields', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

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
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('findById', () => {
    it.effect('finds existing entry by id', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* InjectionLogRepo
        const created = yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            drug: DrugName.make('Testosterone'),
            source: Option.none(),
            dosage: Dosage.make('100mg'),
            injectionSite: Option.none(),
            notes: Option.none(),
            scheduleId: Option.none(),
          },
          'user-123',
        )

        const found = yield* repo.findById(created.id, 'user-123')
        expect(Option.isSome(found)).toBe(true)
        if (Option.isSome(found)) {
          expect(found.value.id).toBe(created.id)
          expect(found.value.drug).toBe('Testosterone')
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('returns none for non-existent id', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* InjectionLogRepo
        const found = yield* repo.findById('non-existent', 'user-123')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('does not find entry belonging to different user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-456')

        const repo = yield* InjectionLogRepo
        const found = yield* repo.findById('inj-1', 'user-123')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('list', () => {
    it.effect('lists injection logs with pagination', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* InjectionLogRepo
        for (let i = 0; i < 5; i++) {
          yield* repo.create(
            {
              datetime: DateTime.unsafeMake(`2024-01-${15 + i}T10:00:00Z`),
              drug: DrugName.make('Testosterone'),
              source: Option.none(),
              dosage: Dosage.make(`${100 + i * 10}mg`),
              injectionSite: Option.none(),
              notes: Option.none(),
              scheduleId: Option.none(),
            },
            'user-123',
          )
        }

        const page1 = yield* repo.list({ limit: Limit.make(2), offset: Offset.make(0) }, 'user-123')
        expect(page1.length).toBe(2)
        // Should be sorted by datetime DESC
        expect(page1[0]!.dosage).toBe('140mg') // Jan 19
        expect(page1[1]!.dosage).toBe('130mg') // Jan 18

        const page2 = yield* repo.list({ limit: Limit.make(2), offset: Offset.make(2) }, 'user-123')
        expect(page2.length).toBe(2)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('filters by drug', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* InjectionLogRepo
        yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            drug: DrugName.make('Testosterone'),
            source: Option.none(),
            dosage: Dosage.make('100mg'),
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

        const filtered = yield* repo.list(
          {
            limit: Limit.make(50),
            offset: Offset.make(0),
            drug: DrugName.make('Testosterone'),
          },
          'user-123',
        )

        expect(filtered.length).toBe(1)
        expect(filtered[0]!.drug).toBe('Testosterone')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('filters by date range', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* InjectionLogRepo
        yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-10T10:00:00Z'),
            drug: DrugName.make('Test'),
            source: Option.none(),
            dosage: Dosage.make('100mg'),
            injectionSite: Option.none(),
            notes: Option.none(),
            scheduleId: Option.none(),
          },
          'user-123',
        )
        yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            drug: DrugName.make('Test'),
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
            datetime: DateTime.unsafeMake('2024-01-20T10:00:00Z'),
            drug: DrugName.make('Test'),
            source: Option.none(),
            dosage: Dosage.make('300mg'),
            injectionSite: Option.none(),
            notes: Option.none(),
            scheduleId: Option.none(),
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
        expect(filtered[0]!.dosage).toBe('200mg')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('only returns entries for the specified user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-123')
        yield* insertInjectionLog('inj-2', new Date('2024-01-16T10:00:00Z'), 'Testosterone', '100mg', 'user-456')
        yield* insertInjectionLog('inj-3', new Date('2024-01-17T10:00:00Z'), 'Testosterone', '100mg', 'user-123')

        const repo = yield* InjectionLogRepo
        const logs = yield* repo.list({ limit: Limit.make(50), offset: Offset.make(0) }, 'user-123')

        expect(logs.length).toBe(2)
        expect(logs.every((l) => l.id === 'inj-1' || l.id === 'inj-3')).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('update', () => {
    it.effect('updates injection log fields', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* InjectionLogRepo
        const created = yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            drug: DrugName.make('Testosterone'),
            source: Option.none(),
            dosage: Dosage.make('100mg'),
            injectionSite: Option.none(),
            notes: Option.none(),
            scheduleId: Option.none(),
          },
          'user-123',
        )

        const updated = yield* repo.update(
          {
            id: created.id,
            dosage: Dosage.make('150mg'),
            injectionSite: Option.some(InjectionSite.make('right deltoid')),
            notes: Option.some(Notes.make('Updated notes')),
            source: Option.none(),
            scheduleId: Option.none(),
          },
          'user-123',
        )

        expect(updated.dosage).toBe('150mg')
        expect(updated.injectionSite).toBe('right deltoid')
        expect(updated.notes).toBe('Updated notes')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('fails for non-existent entry', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* InjectionLogRepo
        const result = yield* repo
          .update(
            {
              id: InjectionLogId.make('non-existent'),
              dosage: Dosage.make('100mg'),
              source: Option.none(),
              injectionSite: Option.none(),
              notes: Option.none(),
              scheduleId: Option.none(),
            },
            'user-123',
          )
          .pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InjectionLogNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('cannot update entry belonging to different user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-456')

        const repo = yield* InjectionLogRepo
        const result = yield* repo
          .update(
            {
              id: InjectionLogId.make('inj-1'),
              dosage: Dosage.make('999mg'),
              source: Option.none(),
              injectionSite: Option.none(),
              notes: Option.none(),
              scheduleId: Option.none(),
            },
            'user-123',
          )
          .pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InjectionLogNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('delete', () => {
    it.effect('deletes existing entry', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* InjectionLogRepo
        const created = yield* repo.create(
          {
            datetime: DateTime.unsafeMake('2024-01-15T10:00:00Z'),
            drug: DrugName.make('Testosterone'),
            source: Option.none(),
            dosage: Dosage.make('100mg'),
            injectionSite: Option.none(),
            notes: Option.none(),
            scheduleId: Option.none(),
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

        const repo = yield* InjectionLogRepo
        const deleted = yield* repo.delete('non-existent', 'user-123')
        expect(deleted).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('cannot delete entry belonging to different user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-456')

        const repo = yield* InjectionLogRepo
        const deleted = yield* repo.delete('inj-1', 'user-123')
        expect(deleted).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getUniqueDrugs', () => {
    it.effect('returns unique drug names for user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-123')
        yield* insertInjectionLog('inj-2', new Date('2024-01-16T10:00:00Z'), 'BPC-157', '250mcg', 'user-123')
        yield* insertInjectionLog('inj-3', new Date('2024-01-17T10:00:00Z'), 'Testosterone', '100mg', 'user-123')
        yield* insertInjectionLog('inj-4', new Date('2024-01-18T10:00:00Z'), 'Other Drug', '100mg', 'user-456')

        const repo = yield* InjectionLogRepo
        const drugs = yield* repo.getUniqueDrugs('user-123')

        expect(drugs.length).toBe(2)
        expect(drugs).toContain('BPC-157')
        expect(drugs).toContain('Testosterone')
        expect(drugs).not.toContain('Other Drug')
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getUniqueSites', () => {
    it.effect('returns unique injection sites for user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Test', '100mg', 'user-123', {
          injectionSite: 'left VG',
        })
        yield* insertInjectionLog('inj-2', new Date('2024-01-16T10:00:00Z'), 'Test', '100mg', 'user-123', {
          injectionSite: 'right VG',
        })
        yield* insertInjectionLog('inj-3', new Date('2024-01-17T10:00:00Z'), 'Test', '100mg', 'user-123', {
          injectionSite: 'left VG',
        })
        yield* insertInjectionLog('inj-4', new Date('2024-01-18T10:00:00Z'), 'Test', '100mg', 'user-456', {
          injectionSite: 'other site',
        })

        const repo = yield* InjectionLogRepo
        const sites = yield* repo.getUniqueSites('user-123')

        expect(sites.length).toBe(2)
        expect(sites).toContain('left VG')
        expect(sites).toContain('right VG')
        expect(sites).not.toContain('other site')
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getLastSite', () => {
    it.effect('returns most recent injection site', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Test', '100mg', 'user-123', {
          injectionSite: 'left VG',
        })
        yield* insertInjectionLog('inj-2', new Date('2024-01-17T10:00:00Z'), 'Test', '100mg', 'user-123', {
          injectionSite: 'right VG',
        })

        const repo = yield* InjectionLogRepo
        const lastSite = yield* repo.getLastSite('user-123')

        expect(lastSite).toBe('right VG')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('returns null when no injections exist', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* InjectionLogRepo
        const lastSite = yield* repo.getLastSite('user-123')

        expect(lastSite).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('listBySchedule', () => {
    it.effect('returns injections for a specific schedule', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertSchedule('sched-1', 'TRT', 'Testosterone', 'weekly', new Date('2024-01-01'), 'user-123')
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-123', {
          scheduleId: 'sched-1',
        })
        yield* insertInjectionLog('inj-2', new Date('2024-01-22T10:00:00Z'), 'Testosterone', '100mg', 'user-123', {
          scheduleId: 'sched-1',
        })
        yield* insertInjectionLog('inj-3', new Date('2024-01-16T10:00:00Z'), 'BPC-157', '250mcg', 'user-123')

        const repo = yield* InjectionLogRepo
        const logs = yield* repo.listBySchedule('sched-1', 'user-123')

        expect(logs.length).toBe(2)
        expect(logs.every((l) => l.scheduleId === 'sched-1')).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('bulkAssignSchedule', () => {
    it.effect('assigns schedule to multiple injections', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertSchedule('sched-1', 'TRT', 'Testosterone', 'weekly', new Date('2024-01-01'), 'user-123')
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-123')
        yield* insertInjectionLog('inj-2', new Date('2024-01-22T10:00:00Z'), 'Testosterone', '100mg', 'user-123')

        const repo = yield* InjectionLogRepo
        yield* repo.bulkAssignSchedule(
          {
            ids: [InjectionLogId.make('inj-1'), InjectionLogId.make('inj-2')],
            scheduleId: InjectionScheduleId.make('sched-1'),
          },
          'user-123',
        )

        // Verify the assignment worked by checking the injections are now linked
        const logs = yield* repo.listBySchedule('sched-1', 'user-123')
        expect(logs.length).toBe(2)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('does not assign injections belonging to different user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertSchedule('sched-1', 'TRT', 'Testosterone', 'weekly', new Date('2024-01-01'), 'user-123')
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-456')

        const repo = yield* InjectionLogRepo
        yield* repo.bulkAssignSchedule(
          {
            ids: [InjectionLogId.make('inj-1')],
            scheduleId: InjectionScheduleId.make('sched-1'),
          },
          'user-123',
        )

        // Should not have updated any rows since the injection belongs to user-456
        // Verify by checking no injections are linked to this schedule for user-123
        const logs = yield* repo.listBySchedule('sched-1', 'user-123')
        expect(logs.length).toBe(0)
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
