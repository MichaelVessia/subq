import { DateTime } from 'effect'
import { nextDoseTiming, type Frequency } from '@subq/shared'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MAX_OVERDUE_REMINDER_DAYS = 7

export interface ReminderCandidate {
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly drug: string
  readonly dosage: string
  readonly frequency: Frequency
  readonly startDate: DateTime.Utc
  readonly lastInjectionDate: DateTime.Utc | null
  readonly lastInjectionSite: string | null
}

export interface UserDueForReminder {
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly drug: string
  readonly dosage: string
  readonly daysSinceLastInjection: number | null
  readonly lastInjectionSite: string | null
  readonly isOverdue: boolean
  readonly daysOverdue: number
}

const daysSince = (date: DateTime.Utc | null, now: DateTime.Utc): number | null => {
  if (date === null) {
    return null
  }

  return Math.round((DateTime.toEpochMillis(now) - DateTime.toEpochMillis(date)) / MS_PER_DAY)
}

export const planReminder = (candidate: ReminderCandidate, now: DateTime.Utc): UserDueForReminder => {
  const timing = nextDoseTiming({
    startDate: candidate.startDate,
    frequency: candidate.frequency,
    lastInjectionDate: candidate.lastInjectionDate,
    now,
  })

  return {
    userId: candidate.userId,
    email: candidate.email,
    name: candidate.name,
    drug: candidate.drug,
    dosage: candidate.dosage,
    daysSinceLastInjection: daysSince(candidate.lastInjectionDate, now),
    lastInjectionSite: candidate.lastInjectionSite,
    isOverdue: timing.isOverdue,
    daysOverdue: timing.isOverdue ? Math.abs(timing.daysUntilDue) : 0,
  }
}

export const planReminderIfDue = (candidate: ReminderCandidate, now: DateTime.Utc): UserDueForReminder | null => {
  const timing = nextDoseTiming({
    startDate: candidate.startDate,
    frequency: candidate.frequency,
    lastInjectionDate: candidate.lastInjectionDate,
    now,
  })

  if (timing.daysUntilDue > 0 || timing.daysUntilDue < -MAX_OVERDUE_REMINDER_DAYS) {
    return null
  }

  return planReminder(candidate, now)
}
