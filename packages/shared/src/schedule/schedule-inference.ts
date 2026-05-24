import { DateTime } from 'effect'
import type { InjectionLog } from '../injection/domain.js'

const DAY_MILLIS = 1000 * 60 * 60 * 24

export interface ScheduleInferencePhase {
  readonly order: number
  readonly durationDays: number | null
  readonly dosage: string
}

export interface ScheduleInferenceDraft {
  readonly name: string
  readonly drug: string
  readonly startDate: DateTime.Utc
  readonly phases: ReadonlyArray<ScheduleInferencePhase>
}

export function inferScheduleDraftFromInjectionLogs(
  injections: ReadonlyArray<InjectionLog>,
): ScheduleInferenceDraft | null {
  const firstInjection = injections[0]
  if (firstInjection === undefined) {
    return null
  }

  let startDate = firstInjection.datetime
  const dosageStartDates = new Map<string, DateTime.Utc>()

  for (const injection of injections) {
    if (DateTime.toEpochMillis(injection.datetime) < DateTime.toEpochMillis(startDate)) {
      startDate = injection.datetime
    }

    const existingStartDate = dosageStartDates.get(injection.dosage)
    dosageStartDates.set(
      injection.dosage,
      existingStartDate === undefined ||
        DateTime.toEpochMillis(injection.datetime) < DateTime.toEpochMillis(existingStartDate)
        ? injection.datetime
        : existingStartDate,
    )
  }

  const phaseStarts = [...dosageStartDates.entries()]
    .map(([dosage, phaseStartDate]) => ({ dosage, phaseStartDate }))
    .sort((a, b) => DateTime.toEpochMillis(a.phaseStartDate) - DateTime.toEpochMillis(b.phaseStartDate))

  return {
    name: `${firstInjection.drug} Schedule`,
    drug: firstInjection.drug,
    startDate,
    phases: phaseStarts.map((phase, index) => {
      const nextPhase = phaseStarts[index + 1]

      return {
        order: index + 1,
        durationDays:
          nextPhase === undefined
            ? null
            : Math.max(
                1,
                Math.round(
                  (DateTime.toEpochMillis(nextPhase.phaseStartDate) - DateTime.toEpochMillis(phase.phaseStartDate)) /
                    DAY_MILLIS,
                ),
              ),
        dosage: phase.dosage,
      }
    }),
  }
}
