import { DateTime } from 'effect'
import type { InjectionLog } from '../injection/domain.js'
import {
  NextScheduledDose,
  PhaseInjectionSummary,
  PhaseOrder,
  SchedulePhaseView,
  ScheduleView,
  type Frequency,
  type InjectionSchedule,
  type SchedulePhase,
} from './domain.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface CurrentPhase {
  readonly phaseIndex: number
  readonly phase: SchedulePhase
}

export interface NextDoseTiming {
  readonly suggestedDate: DateTime.Utc
  readonly daysUntilDue: number
  readonly isOverdue: boolean
}

export interface NextDoseTimingInput {
  readonly startDate: DateTime.Utc
  readonly frequency: Frequency | string
  readonly lastInjectionDate: DateTime.Utc | null
  readonly now: DateTime.Utc
}

type PhaseStatus = 'completed' | 'current' | 'upcoming'

export const frequencyToDays = (frequency: Frequency | string): number => {
  switch (frequency) {
    case 'daily':
      return 1
    case 'every_3_days':
      return 3
    case 'weekly':
      return 7
    case 'every_2_weeks':
      return 14
    case 'monthly':
      return 30
    default:
      return 7
  }
}

const addDays = (date: DateTime.Utc, days: number): DateTime.Utc =>
  DateTime.makeUnsafe(DateTime.toEpochMillis(date) + days * MS_PER_DAY)

const daysBetweenFloor = (start: DateTime.Utc, end: DateTime.Utc): number =>
  Math.floor((DateTime.toEpochMillis(end) - DateTime.toEpochMillis(start)) / MS_PER_DAY)

const daysUntilRounded = (date: DateTime.Utc, now: DateTime.Utc): number =>
  Math.round((DateTime.toEpochMillis(date) - DateTime.toEpochMillis(now)) / MS_PER_DAY)

export const nextDoseTiming = ({
  startDate,
  frequency,
  lastInjectionDate,
  now,
}: NextDoseTimingInput): NextDoseTiming => {
  const suggestedDate =
    lastInjectionDate === null
      ? DateTime.isGreaterThan(now, startDate)
        ? now
        : startDate
      : addDays(lastInjectionDate, frequencyToDays(frequency))
  const daysUntilDue = daysUntilRounded(suggestedDate, now)

  return {
    suggestedDate,
    daysUntilDue,
    isOverdue: daysUntilDue < 0,
  }
}

export const currentPhase = (schedule: InjectionSchedule, now: DateTime.Utc): CurrentPhase | null => {
  const daysSinceStart = daysBetweenFloor(schedule.startDate, now)
  let fallback: CurrentPhase | null = null
  let cumulativeDays = 0

  for (const [phaseIndex, phase] of schedule.phases.entries()) {
    const current = { phaseIndex, phase }
    fallback = current

    if (phase.durationDays === null) {
      return current
    }

    if (daysSinceStart < cumulativeDays + phase.durationDays) {
      return current
    }

    cumulativeDays += phase.durationDays
  }

  return fallback
}

export const nextDose = (
  schedule: InjectionSchedule,
  lastInjectionDate: DateTime.Utc | null,
  now: DateTime.Utc,
): NextScheduledDose | null => {
  const activePhase = currentPhase(schedule, now)
  if (activePhase === null) {
    return null
  }

  const timing = nextDoseTiming({
    startDate: schedule.startDate,
    frequency: schedule.frequency,
    lastInjectionDate,
    now,
  })

  return new NextScheduledDose({
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    drug: schedule.drug,
    dosage: activePhase.phase.dosage,
    suggestedDate: timing.suggestedDate,
    currentPhase: PhaseOrder.make(activePhase.phaseIndex + 1),
    totalPhases: schedule.phases.length,
    daysUntilDue: timing.daysUntilDue,
    isOverdue: timing.isOverdue,
  })
}

const phaseStatus = (
  phaseStartDate: DateTime.Utc,
  phaseEndDate: DateTime.Utc | null,
  now: DateTime.Utc,
): PhaseStatus => {
  if (phaseEndDate === null) {
    return DateTime.isGreaterThanOrEqualTo(now, phaseStartDate) ? 'current' : 'upcoming'
  }

  if (DateTime.isGreaterThan(now, phaseEndDate)) {
    return 'completed'
  }

  return DateTime.isGreaterThanOrEqualTo(now, phaseStartDate) ? 'current' : 'upcoming'
}

const phaseContainsInjection = (
  phaseStartDate: DateTime.Utc,
  phaseEndDate: DateTime.Utc | null,
  injection: InjectionLog,
): boolean => {
  if (phaseEndDate === null) {
    return DateTime.isGreaterThanOrEqualTo(injection.datetime, phaseStartDate)
  }

  return (
    DateTime.isGreaterThanOrEqualTo(injection.datetime, phaseStartDate) &&
    DateTime.isLessThanOrEqualTo(injection.datetime, phaseEndDate)
  )
}

export const scheduleView = (
  schedule: InjectionSchedule,
  injections: readonly InjectionLog[],
  now: DateTime.Utc,
): ScheduleView => {
  const intervalDays = frequencyToDays(schedule.frequency)
  let cumulativeDays = 0

  const phases = schedule.phases.map((phase) => {
    const phaseStartDate = addDays(schedule.startDate, cumulativeDays)
    const phaseEndDate = phase.durationDays === null ? null : addDays(phaseStartDate, phase.durationDays - 1)
    const phaseInjections = injections.filter((injection) =>
      phaseContainsInjection(phaseStartDate, phaseEndDate, injection),
    )

    if (phase.durationDays !== null) {
      cumulativeDays += phase.durationDays
    }

    return new SchedulePhaseView({
      id: phase.id,
      order: phase.order,
      durationDays: phase.durationDays,
      dosage: phase.dosage,
      startDate: phaseStartDate,
      endDate: phaseEndDate,
      status: phaseStatus(phaseStartDate, phaseEndDate, now),
      expectedInjections: phase.durationDays === null ? null : Math.ceil(phase.durationDays / intervalDays),
      completedInjections: phaseInjections.length,
      injections: phaseInjections.map(
        (injection) =>
          new PhaseInjectionSummary({
            id: injection.id,
            datetime: injection.datetime,
            dosage: injection.dosage,
            injectionSite: injection.injectionSite,
          }),
      ),
    })
  })

  const hasIndefinitePhase = schedule.phases.some((phase) => phase.durationDays === null)
  const totalDurationDays = schedule.phases.reduce((sum, phase) => sum + (phase.durationDays ?? 0), 0)
  const endDate = hasIndefinitePhase ? null : addDays(schedule.startDate, totalDurationDays - 1)
  const totalExpectedInjections = hasIndefinitePhase
    ? null
    : phases.reduce((sum, phase) => sum + (phase.expectedInjections ?? 0), 0)

  return new ScheduleView({
    id: schedule.id,
    name: schedule.name,
    drug: schedule.drug,
    source: schedule.source,
    frequency: schedule.frequency,
    startDate: schedule.startDate,
    endDate,
    isActive: schedule.isActive,
    notes: schedule.notes,
    totalExpectedInjections,
    totalCompletedInjections: phases.reduce((sum, phase) => sum + phase.completedInjections, 0),
    phases,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  })
}
