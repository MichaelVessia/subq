import { DateTime } from 'effect'
import type { NextScheduledDose } from '@subq/shared'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MAX_OVERDUE_REMINDER_DAYS = 7

export interface ReminderCandidate {
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly nextScheduledDose: NextScheduledDose
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
  const nextScheduledDose = candidate.nextScheduledDose

  return {
    userId: candidate.userId,
    email: candidate.email,
    name: candidate.name,
    drug: nextScheduledDose.drug,
    dosage: nextScheduledDose.dosage,
    daysSinceLastInjection: daysSince(candidate.lastInjectionDate, now),
    lastInjectionSite: candidate.lastInjectionSite,
    isOverdue: nextScheduledDose.isOverdue,
    daysOverdue: nextScheduledDose.isOverdue ? Math.abs(nextScheduledDose.daysUntilDue) : 0,
  }
}

export const planReminderIfDue = (candidate: ReminderCandidate, now: DateTime.Utc): UserDueForReminder | null => {
  const nextScheduledDose = candidate.nextScheduledDose

  if (nextScheduledDose.daysUntilDue > 0 || nextScheduledDose.daysUntilDue < -MAX_OVERDUE_REMINDER_DAYS) {
    return null
  }

  return planReminder(candidate, now)
}
