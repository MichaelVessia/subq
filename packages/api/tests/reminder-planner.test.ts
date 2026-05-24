import { describe, expect, it } from '@effect/vitest'
import { DateTime } from 'effect'
import { planReminder, planReminderIfDue, type ReminderCandidate } from '../src/reminders/reminder-planner.js'

const baseCandidate: ReminderCandidate = {
  userId: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  drug: 'Semaglutide',
  dosage: '2.5mg',
  frequency: 'weekly',
  startDate: DateTime.makeUnsafe('2024-01-01T00:00:00Z'),
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
        lastInjectionDate: DateTime.makeUnsafe('2024-01-01T00:00:00Z'),
      },
      DateTime.makeUnsafe('2024-01-16T00:00:00Z'),
    )

    expect(reminder).toBeNull()
  })

  it('plans active schedules without applying the due filter', () => {
    const reminder = planReminder(
      {
        ...baseCandidate,
        lastInjectionDate: DateTime.makeUnsafe('2024-01-15T00:00:00Z'),
      },
      DateTime.makeUnsafe('2024-01-16T00:00:00Z'),
    )

    expect(reminder.daysSinceLastInjection).toBe(1)
    expect(reminder.isOverdue).toBe(false)
    expect(reminder.daysOverdue).toBe(0)
  })
})
