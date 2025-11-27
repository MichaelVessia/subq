import {
  Dosage,
  DrugName,
  DrugSource,
  type Frequency,
  InjectionSchedule,
  type InjectionScheduleCreate,
  InjectionScheduleId,
  type InjectionScheduleUpdate,
  Notes,
  type PhaseDurationDays,
  type PhaseOrder,
  ScheduleName,
  ScheduleNotFoundError,
  SchedulePhase,
  type SchedulePhaseCreate,
  SchedulePhaseId,
} from '@subq/shared'
import { Effect, Layer, Option } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { ScheduleRepo } from '../src/schedule/schedule-repo.js'

// ============================================
// Test Layer for ScheduleRepo
// ============================================

const ScheduleRepoTest = Layer.sync(ScheduleRepo, () => {
  const scheduleStore = new Map<string, InjectionSchedule>()
  const injectionDateStore = new Map<string, Date>() // key: `${userId}-${drug}`
  let scheduleCounter = 0
  let phaseCounter = 0

  const createPhases = (scheduleId: string, phases: readonly SchedulePhaseCreate[]): SchedulePhase[] => {
    const now = new Date()
    return phases.map(
      (p) =>
        new SchedulePhase({
          id: SchedulePhaseId.make(`phase-${phaseCounter++}`),
          scheduleId: InjectionScheduleId.make(scheduleId),
          order: p.order,
          durationDays: p.durationDays,
          dosage: p.dosage,
          createdAt: now,
          updatedAt: now,
        }),
    )
  }

  return {
    list: (_userId: string) =>
      Effect.sync(() => {
        const schedules = Array.from(scheduleStore.values())
        return schedules.sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
      }),

    getActive: (_userId: string) =>
      Effect.sync(() => {
        const active = Array.from(scheduleStore.values()).find((s) => s.isActive)
        return active ? Option.some(active) : Option.none()
      }),

    findById: (id: string) =>
      Effect.sync(() => {
        const schedule = scheduleStore.get(id)
        return schedule ? Option.some(schedule) : Option.none()
      }),

    create: (data: InjectionScheduleCreate, _userId: string) =>
      Effect.sync(() => {
        const id = `schedule-${scheduleCounter++}`

        // Deactivate existing active schedules
        for (const [key, schedule] of scheduleStore) {
          if (schedule.isActive) {
            scheduleStore.set(
              key,
              new InjectionSchedule({
                ...schedule,
                isActive: false,
                updatedAt: new Date(),
              }),
            )
          }
        }

        const now = new Date()
        const schedule = new InjectionSchedule({
          id: InjectionScheduleId.make(id),
          name: data.name,
          drug: data.drug,
          source: Option.isSome(data.source) ? data.source.value : null,
          frequency: data.frequency,
          startDate: data.startDate,
          isActive: true,
          notes: Option.isSome(data.notes) ? data.notes.value : null,
          phases: createPhases(id, data.phases),
          createdAt: now,
          updatedAt: now,
        })
        scheduleStore.set(id, schedule)
        return schedule
      }),

    update: (data: InjectionScheduleUpdate) =>
      Effect.gen(function* () {
        const current = scheduleStore.get(data.id)
        if (!current) {
          return yield* ScheduleNotFoundError.make({ id: data.id })
        }

        // If activating this schedule, deactivate others
        if (data.isActive === true && !current.isActive) {
          for (const [key, schedule] of scheduleStore) {
            if (schedule.isActive && key !== data.id) {
              scheduleStore.set(
                key,
                new InjectionSchedule({
                  ...schedule,
                  isActive: false,
                  updatedAt: new Date(),
                }),
              )
            }
          }
        }

        const now = new Date()
        const phases = data.phases ? createPhases(data.id, data.phases) : current.phases

        const updated = new InjectionSchedule({
          ...current,
          name: data.name ?? current.name,
          drug: data.drug ?? current.drug,
          source: data.source !== undefined ? data.source : current.source,
          frequency: data.frequency ?? current.frequency,
          startDate: data.startDate ?? current.startDate,
          isActive: data.isActive ?? current.isActive,
          notes: data.notes !== undefined ? data.notes : current.notes,
          phases,
          updatedAt: now,
        })
        scheduleStore.set(data.id, updated)
        return updated
      }),

    delete: (id: string) =>
      Effect.sync(() => {
        const had = scheduleStore.has(id)
        scheduleStore.delete(id)
        return had
      }),

    getLastInjectionDate: (_userId: string, drug: string) =>
      Effect.sync(() => {
        const key = `test-${drug}`
        const date = injectionDateStore.get(key)
        return date ? Option.some(date) : Option.none()
      }),
  }
})

// ============================================
// Tests
// ============================================

describe('ScheduleRepo', () => {
  describe('create', () => {
    it.effect('creates a schedule with phases', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo

        const created = yield* repo.create(
          {
            name: ScheduleName.make('TRT Schedule'),
            drug: DrugName.make('Testosterone Cypionate'),
            source: Option.some(DrugSource.make('Empower')),
            frequency: 'weekly' as Frequency,
            startDate: new Date('2024-01-01'),
            notes: Option.some(Notes.make('Start low')),
            phases: [
              { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: Dosage.make('100mg') },
              { order: 2 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: Dosage.make('150mg') },
              { order: 3 as PhaseOrder, durationDays: null, dosage: Dosage.make('200mg') }, // Maintenance
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
        expect(created.phases[2]!.durationDays).toBeNull() // Indefinite
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )

    it.effect('deactivates existing schedules when creating new one', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo

        const first = yield* repo.create(
          {
            name: ScheduleName.make('First Schedule'),
            drug: DrugName.make('Drug A'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: new Date('2024-01-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: Dosage.make('100mg') }],
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
            startDate: new Date('2024-02-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: Dosage.make('200mg') }],
          },
          'user-123',
        )

        expect(second.isActive).toBe(true)

        // First should now be inactive
        const firstAfter = yield* repo.findById(first.id)
        expect(Option.isSome(firstAfter)).toBe(true)
        if (Option.isSome(firstAfter)) {
          expect(firstAfter.value.isActive).toBe(false)
        }
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )
  })

  describe('getActive', () => {
    it.effect('returns none when no active schedule', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo
        const active = yield* repo.getActive('user-123')
        expect(Option.isNone(active)).toBe(true)
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )

    it.effect('returns the active schedule', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo

        const created = yield* repo.create(
          {
            name: ScheduleName.make('Active Schedule'),
            drug: DrugName.make('Test Drug'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: new Date('2024-01-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: null, dosage: Dosage.make('100mg') }],
          },
          'user-123',
        )

        const active = yield* repo.getActive('user-123')
        expect(Option.isSome(active)).toBe(true)
        if (Option.isSome(active)) {
          expect(active.value.id).toBe(created.id)
        }
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )
  })

  describe('findById', () => {
    it.effect('returns none for non-existent id', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo
        const found = yield* repo.findById('non-existent')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )

    it.effect('finds schedule by id', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo

        const created = yield* repo.create(
          {
            name: ScheduleName.make('Find Me'),
            drug: DrugName.make('Test'),
            source: Option.none(),
            frequency: 'daily' as Frequency,
            startDate: new Date('2024-01-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: 7 as PhaseDurationDays, dosage: Dosage.make('50mg') }],
          },
          'user-123',
        )

        const found = yield* repo.findById(created.id)
        expect(Option.isSome(found)).toBe(true)
        if (Option.isSome(found)) {
          expect(found.value.name).toBe('Find Me')
        }
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )
  })

  describe('update', () => {
    it.effect('updates schedule fields', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo

        const created = yield* repo.create(
          {
            name: ScheduleName.make('Original'),
            drug: DrugName.make('Drug'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: new Date('2024-01-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: Dosage.make('100mg') }],
          },
          'user-123',
        )

        const updated = yield* repo.update({
          id: created.id,
          name: ScheduleName.make('Updated'),
          frequency: 'every_3_days' as Frequency,
        })

        expect(updated.name).toBe('Updated')
        expect(updated.frequency).toBe('every_3_days')
        expect(updated.drug).toBe('Drug') // Unchanged
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )

    it.effect('updates phases when provided', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo

        const created = yield* repo.create(
          {
            name: ScheduleName.make('Phases Test'),
            drug: DrugName.make('Drug'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: new Date('2024-01-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: Dosage.make('100mg') }],
          },
          'user-123',
        )

        expect(created.phases.length).toBe(1)

        const updated = yield* repo.update({
          id: created.id,
          phases: [
            { order: 1 as PhaseOrder, durationDays: 14 as PhaseDurationDays, dosage: Dosage.make('50mg') },
            { order: 2 as PhaseOrder, durationDays: null, dosage: Dosage.make('100mg') },
          ],
        })

        expect(updated.phases.length).toBe(2)
        expect(updated.phases[0]!.dosage).toBe('50mg')
        expect(updated.phases[1]!.durationDays).toBeNull()
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )

    it.effect('activating schedule deactivates others', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo

        const first = yield* repo.create(
          {
            name: ScheduleName.make('First'),
            drug: DrugName.make('A'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: new Date('2024-01-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: null, dosage: Dosage.make('100mg') }],
          },
          'user-123',
        )

        // Create second (deactivates first)
        const second = yield* repo.create(
          {
            name: ScheduleName.make('Second'),
            drug: DrugName.make('B'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: new Date('2024-02-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: null, dosage: Dosage.make('200mg') }],
          },
          'user-123',
        )

        // Reactivate first
        yield* repo.update({
          id: first.id,
          isActive: true,
        })

        const firstAfter = yield* repo.findById(first.id)
        const secondAfter = yield* repo.findById(second.id)

        expect(Option.isSome(firstAfter) && firstAfter.value.isActive).toBe(true)
        expect(Option.isSome(secondAfter) && secondAfter.value.isActive).toBe(false)
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )
  })

  describe('delete', () => {
    it.effect('deletes existing schedule', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo

        const created = yield* repo.create(
          {
            name: ScheduleName.make('To Delete'),
            drug: DrugName.make('Drug'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: new Date('2024-01-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: null, dosage: Dosage.make('100mg') }],
          },
          'user-123',
        )

        const deleted = yield* repo.delete(created.id)
        expect(deleted).toBe(true)

        const found = yield* repo.findById(created.id)
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )

    it.effect('returns false for non-existent schedule', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo
        const deleted = yield* repo.delete('non-existent')
        expect(deleted).toBe(false)
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )
  })

  describe('getLastInjectionDate', () => {
    it.effect('returns none when no injections exist', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo
        const lastDate = yield* repo.getLastInjectionDate('user-123', 'Test Drug')
        expect(Option.isNone(lastDate)).toBe(true)
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )
  })

  describe('list', () => {
    it.effect('returns schedules sorted by start date descending', () =>
      Effect.gen(function* () {
        const repo = yield* ScheduleRepo

        yield* repo.create(
          {
            name: ScheduleName.make('January'),
            drug: DrugName.make('A'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: new Date('2024-01-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: null, dosage: Dosage.make('100mg') }],
          },
          'user-123',
        )

        yield* repo.create(
          {
            name: ScheduleName.make('March'),
            drug: DrugName.make('B'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: new Date('2024-03-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: null, dosage: Dosage.make('200mg') }],
          },
          'user-123',
        )

        yield* repo.create(
          {
            name: ScheduleName.make('February'),
            drug: DrugName.make('C'),
            source: Option.none(),
            frequency: 'weekly' as Frequency,
            startDate: new Date('2024-02-01'),
            notes: Option.none(),
            phases: [{ order: 1 as PhaseOrder, durationDays: null, dosage: Dosage.make('150mg') }],
          },
          'user-123',
        )

        const schedules = yield* repo.list('user-123')

        // Should be sorted by start date descending: March, February, January
        expect(schedules.length).toBe(3)
        expect(schedules[0]!.name).toBe('March')
        expect(schedules[1]!.name).toBe('February')
        expect(schedules[2]!.name).toBe('January')
      }).pipe(Effect.provide(ScheduleRepoTest)),
    )
  })
})
