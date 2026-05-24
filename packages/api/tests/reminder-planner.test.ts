import { describe, expect, it } from '@effect/vitest'
import { DateTime } from 'effect'
import { Dosage, DrugName, InjectionScheduleId, NextScheduledDose, PhaseOrder, ScheduleName } from '@subq/shared'
import { planReminder, planReminderIfDue, type ReminderCandidate } from '../src/reminders/reminder-planner.js'

const makeNextScheduledDose = (daysUntilDue: number): NextScheduledDose =>
  new NextScheduledDose({
    scheduleId: InjectionScheduleId.make('schedule-1'),
    scheduleName: ScheduleName.make('Test schedule'),
    drug: DrugName.make('Semaglutide'),
    dosage: Dosage.make('2.5mg'),
    suggestedDate: DateTime.makeUnsafe('2024-01-15T00:00:00Z'),
    currentPhase: PhaseOrder.make(1),
    totalPhases: 2,
    daysUntilDue,
    isOverdue: daysUntilDue < 0,
  })

const baseCandidate: ReminderCandidate = {
  userId: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  nextScheduledDose: makeNextScheduledDose(0),
  lastInjectionDate: null,
  lastInjectionSite: null,
}

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }
  return value
}

describe('ReminderPlanner', () => {
  it('includes users whose scheduled dose is due today', () => {
    const reminder = requireValue(
      planReminderIfDue(
        {
          ...baseCandidate,
          nextScheduledDose: makeNextScheduledDose(0),
          lastInjectionDate: DateTime.makeUnsafe('2024-01-08T00:00:00Z'),
        },
        DateTime.makeUnsafe('2024-01-15T00:00:00Z'),
      ),
    )

    expect(reminder.daysSinceLastInjection).toBe(7)
    expect(reminder.isOverdue).toBe(false)
    expect(reminder.daysOverdue).toBe(0)
  })

  it('suppresses users more than seven days overdue', () => {
    const reminder = planReminderIfDue(
      {
        ...baseCandidate,
        nextScheduledDose: makeNextScheduledDose(-8),
        lastInjectionDate: DateTime.makeUnsafe('2024-01-07T00:00:00Z'),
      },
      DateTime.makeUnsafe('2024-01-15T00:00:00Z'),
    )

    expect(reminder).toBeNull()
  })

  it('uses the next scheduled dose dosage instead of schedule cadence inputs', () => {
    const reminder = planReminder(
      {
        ...baseCandidate,
        nextScheduledDose: new NextScheduledDose({
          scheduleId: InjectionScheduleId.make('schedule-1'),
          scheduleName: ScheduleName.make('Test schedule'),
          drug: DrugName.make('Semaglutide'),
          dosage: Dosage.make('5mg'),
          suggestedDate: DateTime.makeUnsafe('2024-01-15T00:00:00Z'),
          currentPhase: PhaseOrder.make(2),
          totalPhases: 2,
          daysUntilDue: 0,
          isOverdue: false,
        }),
        lastInjectionDate: DateTime.makeUnsafe('2024-01-08T00:00:00Z'),
      },
      DateTime.makeUnsafe('2024-01-15T00:00:00Z'),
    )

    expect(reminder.drug).toBe('Semaglutide')
    expect(reminder.dosage).toBe('5mg')
  })

  it('plans active schedules without applying the due filter', () => {
    const reminder = planReminder(
      {
        ...baseCandidate,
        nextScheduledDose: makeNextScheduledDose(6),
        lastInjectionDate: DateTime.makeUnsafe('2024-01-15T00:00:00Z'),
      },
      DateTime.makeUnsafe('2024-01-16T00:00:00Z'),
    )

    expect(reminder.daysSinceLastInjection).toBe(1)
    expect(reminder.isOverdue).toBe(false)
    expect(reminder.daysOverdue).toBe(0)
  })
})
