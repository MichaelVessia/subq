import {
  Dosage,
  DrugName,
  DrugSource,
  type Frequency,
  InjectionScheduleId,
  Notes,
  type PhaseDurationDays,
  type PhaseOrder,
  ScheduleName,
} from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { ScheduleRepo, ScheduleRepoLive } from '../src/schedule/schedule-repo.js'
import {
  clearTables,
  insertInjectionLog,
  insertSchedule,
  insertSchedulePhase,
  makeTestLayer,
  setupTables,
} from './helpers/test-db.js'

const TestLayer = makeTestLayer(ScheduleRepoLive)

describe('ScheduleRepo', () => {
  describe('create', () => {
    it.effect('creates a schedule with phases', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const created = yield* repo.create(
          {
            name: ScheduleName.make('TRT Schedule'),
            drug: DrugName.make('Testosterone Cypionate'),
            source: Option.some(DrugSource.make('Empower')),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-01-01'),
            notes: Option.some(Notes.make('Start low')),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: 28 as PhaseDurationDays,
                dosage: Dosage.make('100mg'),
              },
              {
                order: 2 as PhaseOrder,
                durationDays: 28 as PhaseDurationDays,
                dosage: Dosage.make('150mg'),
              },
              {
                order: 3 as PhaseOrder,
                durationDays: null,
                dosage: Dosage.make('200mg'),
              },
            ],
          },
          'user-123',
        )

        expect(created.name).toBe('TRT Schedule')
        expect(created.drug).toBe('Testosterone Cypionate')
        expect(created.source).toBe('Empower')
        expect(created.frequency).toBe('weekly')
        expect(created.isActive).toBe(true)
        expect(created.phases.length).toBe(3)
        expect(created.phases[0]!.dosage).toBe('100mg')
        expect(created.phases[2]!.durationDays).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('deactivates existing schedules when creating new one', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const first = yield* repo.create(
          {
            name: ScheduleName.make('First Schedule'),
            drug: DrugName.make('Drug A'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-01-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: 28 as PhaseDurationDays,
                dosage: Dosage.make('100mg'),
              },
            ],
          },
          'user-123',
        )

        expect(first.isActive).toBe(true)

        const second = yield* repo.create(
          {
            name: ScheduleName.make('Second Schedule'),
            drug: DrugName.make('Drug B'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-02-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: 28 as PhaseDurationDays,
                dosage: Dosage.make('200mg'),
              },
            ],
          },
          'user-123',
        )

        expect(second.isActive).toBe(true)

        const firstAfter = yield* repo.findById(first.id, 'user-123')
        expect(Option.isSome(firstAfter)).toBe(true)
        if (Option.isSome(firstAfter)) {
          expect(firstAfter.value.isActive).toBe(false)
        }
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getActive', () => {
    it.effect('returns none when no active schedule', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const active = yield* repo.getActive('user-123')
        expect(Option.isNone(active)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('returns the active schedule', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const created = yield* repo.create(
          {
            name: ScheduleName.make('Active Schedule'),
            drug: DrugName.make('Test Drug'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-01-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: null,
                dosage: Dosage.make('100mg'),
              },
            ],
          },
          'user-123',
        )

        const active = yield* repo.getActive('user-123')
        expect(Option.isSome(active)).toBe(true)
        if (Option.isSome(active)) {
          expect(active.value.id).toBe(created.id)
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('only returns active schedule for the specified user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertSchedule('sched-1', 'Other User Schedule', 'Drug', 'weekly', new Date('2024-01-01'), 'user-456', {
          isActive: true,
        })

        const repo = yield* ScheduleRepo
        const active = yield* repo.getActive('user-123')
        expect(Option.isNone(active)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('findById', () => {
    it.effect('returns none for non-existent id', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const found = yield* repo.findById('non-existent', 'user-123')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('finds schedule by id with phases', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const created = yield* repo.create(
          {
            name: ScheduleName.make('Find Me'),
            drug: DrugName.make('Test'),
            source: Option.none(),
            frequency: 'daily' as Frequency,
            startDate: DateTime.unsafeMake('2024-01-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: 7 as PhaseDurationDays,
                dosage: Dosage.make('50mg'),
              },
              {
                order: 2 as PhaseOrder,
                durationDays: null,
                dosage: Dosage.make('100mg'),
              },
            ],
          },
          'user-123',
        )

        const found = yield* repo.findById(created.id, 'user-123')
        expect(Option.isSome(found)).toBe(true)
        if (Option.isSome(found)) {
          expect(found.value.name).toBe('Find Me')
          expect(found.value.phases.length).toBe(2)
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('does not find schedule belonging to different user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertSchedule('sched-1', 'Other User', 'Drug', 'weekly', new Date('2024-01-01'), 'user-456')

        const repo = yield* ScheduleRepo
        const found = yield* repo.findById('sched-1', 'user-123')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('update', () => {
    it.effect('updates schedule fields', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const created = yield* repo.create(
          {
            name: ScheduleName.make('Original'),
            drug: DrugName.make('Drug'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-01-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: 28 as PhaseDurationDays,
                dosage: Dosage.make('100mg'),
              },
            ],
          },
          'user-123',
        )

        const updated = yield* repo.update(
          {
            id: created.id,
            name: ScheduleName.make('Updated'),
            frequency: 'every_3_days' as Frequency,
          },
          'user-123',
        )

        expect(updated.name).toBe('Updated')
        expect(updated.frequency).toBe('every_3_days')
        expect(updated.drug).toBe('Drug')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('updates phases when provided', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const created = yield* repo.create(
          {
            name: ScheduleName.make('Phases Test'),
            drug: DrugName.make('Drug'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-01-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: 28 as PhaseDurationDays,
                dosage: Dosage.make('100mg'),
              },
            ],
          },
          'user-123',
        )

        expect(created.phases.length).toBe(1)

        const updated = yield* repo.update(
          {
            id: created.id,
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: 14 as PhaseDurationDays,
                dosage: Dosage.make('50mg'),
              },
              {
                order: 2 as PhaseOrder,
                durationDays: null,
                dosage: Dosage.make('100mg'),
              },
            ],
          },
          'user-123',
        )

        expect(updated.phases.length).toBe(2)
        expect(updated.phases[0]!.dosage).toBe('50mg')
        expect(updated.phases[1]!.durationDays).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('activating schedule deactivates others', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const first = yield* repo.create(
          {
            name: ScheduleName.make('First'),
            drug: DrugName.make('A'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-01-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: null,
                dosage: Dosage.make('100mg'),
              },
            ],
          },
          'user-123',
        )

        const second = yield* repo.create(
          {
            name: ScheduleName.make('Second'),
            drug: DrugName.make('B'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-02-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: null,
                dosage: Dosage.make('200mg'),
              },
            ],
          },
          'user-123',
        )

        yield* repo.update({ id: first.id, isActive: true }, 'user-123')

        const firstAfter = yield* repo.findById(first.id, 'user-123')
        const secondAfter = yield* repo.findById(second.id, 'user-123')

        expect(Option.isSome(firstAfter) && firstAfter.value.isActive).toBe(true)
        expect(Option.isSome(secondAfter) && secondAfter.value.isActive).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('fails for non-existent schedule', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const result = yield* repo
          .update(
            {
              id: InjectionScheduleId.make('non-existent'),
              name: ScheduleName.make('Updated'),
            },
            'user-123',
          )
          .pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('ScheduleNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('cannot update schedule belonging to different user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertSchedule('sched-1', 'Other User', 'Drug', 'weekly', new Date('2024-01-01'), 'user-456')

        const repo = yield* ScheduleRepo
        const result = yield* repo
          .update(
            {
              id: InjectionScheduleId.make('sched-1'),
              name: ScheduleName.make('Hacked'),
            },
            'user-123',
          )
          .pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('ScheduleNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('delete', () => {
    it.effect('deletes existing schedule', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const created = yield* repo.create(
          {
            name: ScheduleName.make('To Delete'),
            drug: DrugName.make('Drug'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-01-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: null,
                dosage: Dosage.make('100mg'),
              },
            ],
          },
          'user-123',
        )

        const deleted = yield* repo.delete(created.id, 'user-123')
        expect(deleted).toBe(true)

        const found = yield* repo.findById(created.id, 'user-123')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('returns false for non-existent schedule', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const deleted = yield* repo.delete('non-existent', 'user-123')
        expect(deleted).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('cannot delete schedule belonging to different user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertSchedule('sched-1', 'Other User', 'Drug', 'weekly', new Date('2024-01-01'), 'user-456')

        const repo = yield* ScheduleRepo
        const deleted = yield* repo.delete('sched-1', 'user-123')
        expect(deleted).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getLastInjectionDate', () => {
    it.effect('returns none when no injections exist', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        const lastDate = yield* repo.getLastInjectionDate('user-123', 'Test Drug')
        expect(Option.isNone(lastDate)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('returns most recent injection date for drug', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-123')
        yield* insertInjectionLog('inj-2', new Date('2024-01-22T10:00:00Z'), 'Testosterone', '100mg', 'user-123')
        yield* insertInjectionLog('inj-3', new Date('2024-01-20T10:00:00Z'), 'BPC-157', '250mcg', 'user-123')

        const repo = yield* ScheduleRepo
        const lastDate = yield* repo.getLastInjectionDate('user-123', 'Testosterone')

        expect(Option.isSome(lastDate)).toBe(true)
        if (Option.isSome(lastDate)) {
          expect(DateTime.formatIso(lastDate.value)).toContain('2024-01-22')
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('only considers injections for the specified user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-123')
        yield* insertInjectionLog('inj-2', new Date('2024-01-22T10:00:00Z'), 'Testosterone', '100mg', 'user-456')

        const repo = yield* ScheduleRepo
        const lastDate = yield* repo.getLastInjectionDate('user-123', 'Testosterone')

        expect(Option.isSome(lastDate)).toBe(true)
        if (Option.isSome(lastDate)) {
          expect(DateTime.formatIso(lastDate.value)).toContain('2024-01-15')
        }
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('list', () => {
    it.effect('returns schedules sorted by start date descending', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* ScheduleRepo
        yield* repo.create(
          {
            name: ScheduleName.make('January'),
            drug: DrugName.make('A'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-01-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: null,
                dosage: Dosage.make('100mg'),
              },
            ],
          },
          'user-123',
        )

        yield* repo.create(
          {
            name: ScheduleName.make('March'),
            drug: DrugName.make('B'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-03-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: null,
                dosage: Dosage.make('200mg'),
              },
            ],
          },
          'user-123',
        )

        yield* repo.create(
          {
            name: ScheduleName.make('February'),
            drug: DrugName.make('C'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: DateTime.unsafeMake('2024-02-01'),
            notes: Option.none(),
            phases: [
              {
                order: 1 as PhaseOrder,
                durationDays: null,
                dosage: Dosage.make('150mg'),
              },
            ],
          },
          'user-123',
        )

        const schedules = yield* repo.list('user-123')

        expect(schedules.length).toBe(3)
        expect(schedules[0]!.name).toBe('March')
        expect(schedules[1]!.name).toBe('February')
        expect(schedules[2]!.name).toBe('January')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('only returns schedules for the specified user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertSchedule('sched-1', 'User 123 Schedule', 'Drug', 'weekly', new Date('2024-01-01'), 'user-123')
        yield* insertSchedule('sched-2', 'User 456 Schedule', 'Drug', 'weekly', new Date('2024-01-01'), 'user-456')

        const repo = yield* ScheduleRepo
        const schedules = yield* repo.list('user-123')

        expect(schedules.length).toBe(1)
        expect(schedules[0]!.id).toBe('sched-1')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('includes phases with schedules', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertSchedule('sched-1', 'With Phases', 'Drug', 'weekly', new Date('2024-01-01'), 'user-123')
        yield* insertSchedulePhase('phase-1', 'sched-1', 1, '100mg', 28)
        yield* insertSchedulePhase('phase-2', 'sched-1', 2, '200mg', null)

        const repo = yield* ScheduleRepo
        const schedules = yield* repo.list('user-123')

        expect(schedules.length).toBe(1)
        expect(schedules[0]!.phases.length).toBe(2)
        expect(schedules[0]!.phases[0]!.dosage).toBe('100mg')
        expect(schedules[0]!.phases[1]!.durationDays).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
