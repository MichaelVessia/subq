import { describe, expect, it } from '@effect/vitest'
import {
  Dosage,
  DrugName,
  DrugSource,
  InjectionLog,
  InjectionLogId,
  InjectionSchedule,
  InjectionScheduleId,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhase,
  SchedulePhaseId,
  currentPhase,
  nextDose,
  scheduleView,
} from '@subq/shared'
import { DateTime } from 'effect'

const timestamp = DateTime.makeUnsafe('2024-01-01T00:00:00Z')

const makeSchedule = (
  phases: ReadonlyArray<{ readonly order: number; readonly durationDays: number | null; readonly dosage: string }>,
  startDate = DateTime.makeUnsafe('2024-01-01T00:00:00Z'),
) => {
  const scheduleId = InjectionScheduleId.make('schedule-1')

  return new InjectionSchedule({
    id: scheduleId,
    name: ScheduleName.make('Test schedule'),
    drug: DrugName.make('Semaglutide'),
    source: DrugSource.make('Compounded'),
    frequency: 'weekly',
    startDate,
    isActive: true,
    notes: null,
    phases: phases.map(
      (phase) =>
        new SchedulePhase({
          id: SchedulePhaseId.make(`phase-${phase.order}`),
          scheduleId,
          order: PhaseOrder.make(phase.order),
          durationDays: phase.durationDays === null ? null : PhaseDurationDays.make(phase.durationDays),
          dosage: Dosage.make(phase.dosage),
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
    ),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

const makeInjection = (id: string, datetime: string, dosage: string, scheduleId: InjectionScheduleId) =>
  new InjectionLog({
    id: InjectionLogId.make(id),
    datetime: DateTime.makeUnsafe(datetime),
    drug: DrugName.make('Semaglutide'),
    source: DrugSource.make('Compounded'),
    dosage: Dosage.make(dosage),
    injectionSite: null,
    notes: null,
    scheduleId,
    createdAt: timestamp,
    updatedAt: timestamp,
  })

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }
  return value
}

describe('ScheduleEngine', () => {
  it('keeps the current phase before an indefinite maintenance phase is reached', () => {
    const schedule = makeSchedule([
      { order: 1, durationDays: 28, dosage: '2.5mg' },
      { order: 2, durationDays: null, dosage: '5mg' },
    ])

    const active = requireValue(currentPhase(schedule, DateTime.makeUnsafe('2024-01-20T00:00:00Z')))

    expect(active.phase.order).toBe(1)
    expect(active.phase.dosage).toBe('2.5mg')
  })

  it('calculates the next scheduled dose from the active phase and last injection', () => {
    const schedule = makeSchedule([
      { order: 1, durationDays: 28, dosage: '2.5mg' },
      { order: 2, durationDays: 28, dosage: '5mg' },
      { order: 3, durationDays: null, dosage: '7.5mg' },
    ])

    const dose = requireValue(
      nextDose(schedule, DateTime.makeUnsafe('2024-03-08T12:00:00Z'), DateTime.makeUnsafe('2024-03-15T12:00:00Z')),
    )

    expect(dose.currentPhase).toBe(3)
    expect(dose.dosage).toBe('7.5mg')
    expect(DateTime.formatIso(dose.suggestedDate)).toBe('2024-03-15T12:00:00.000Z')
    expect(dose.daysUntilDue).toBe(0)
    expect(dose.isOverdue).toBe(false)
  })

  it('builds a schedule view with phase status, expected counts, and assigned injections', () => {
    const schedule = makeSchedule([
      { order: 1, durationDays: 28, dosage: '2.5mg' },
      { order: 2, durationDays: null, dosage: '5mg' },
    ])
    const injections = [
      makeInjection('injection-1', '2024-01-01T00:00:00Z', '2.5mg', schedule.id),
      makeInjection('injection-2', '2024-01-08T00:00:00Z', '2.5mg', schedule.id),
      makeInjection('injection-3', '2024-01-29T00:00:00Z', '5mg', schedule.id),
    ]

    const view = scheduleView(schedule, injections, DateTime.makeUnsafe('2024-02-05T00:00:00Z'))
    const firstPhase = requireValue(view.phases[0])
    const secondPhase = requireValue(view.phases[1])

    expect(view.endDate).toBeNull()
    expect(view.totalExpectedInjections).toBeNull()
    expect(view.totalCompletedInjections).toBe(3)
    expect(firstPhase.status).toBe('completed')
    expect(firstPhase.expectedInjections).toBe(4)
    expect(firstPhase.completedInjections).toBe(2)
    expect(secondPhase.status).toBe('current')
    expect(secondPhase.expectedInjections).toBeNull()
    expect(secondPhase.completedInjections).toBe(1)
  })
})
