import {
  InjectionScheduleId,
  nextDose,
  type NextScheduledDose,
  ScheduleDatabaseError,
  scheduleView,
  type ScheduleView,
} from '@subq/shared'
import { Context, DateTime, Effect, Layer, Option } from 'effect'
import { InjectionLogRepo } from '../injection/injection-log-repo.js'
import { ScheduleRepo } from './schedule-repo.js'

export interface ActiveScheduleReminderCandidate {
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly nextScheduledDose: NextScheduledDose
  readonly lastInjectionDate: DateTime.Utc | null
  readonly lastInjectionSite: string | null
}

export class ScheduleCadenceService extends Context.Service<
  ScheduleCadenceService,
  {
    readonly getNextScheduledDose: (userId: string) => Effect.Effect<NextScheduledDose | null, ScheduleDatabaseError>
    readonly getScheduleView: (
      userId: string,
      scheduleId: InjectionScheduleId,
    ) => Effect.Effect<ScheduleView | null, ScheduleDatabaseError>
    readonly getReminderCandidates: (
      now: DateTime.Utc,
    ) => Effect.Effect<ActiveScheduleReminderCandidate[], ScheduleDatabaseError>
  }
>()('ScheduleCadenceService') {}

export const ScheduleCadenceServiceLive = Layer.effect(
  ScheduleCadenceService,
  Effect.gen(function* () {
    const scheduleRepo = yield* ScheduleRepo
    const injectionLogRepo = yield* InjectionLogRepo

    const getNextScheduledDose = (userId: string) =>
      Effect.gen(function* () {
        const scheduleOpt = yield* scheduleRepo.getActive(userId)
        if (Option.isNone(scheduleOpt)) {
          return null
        }

        const schedule = scheduleOpt.value
        const lastInjectionOpt = yield* scheduleRepo.getLastInjectionDate(userId, schedule.drug)
        const lastInjectionDate = Option.getOrNull(lastInjectionOpt)
        const now = yield* DateTime.now

        return nextDose(schedule, lastInjectionDate, now)
      })

    const getScheduleView = (userId: string, scheduleId: InjectionScheduleId) =>
      Effect.gen(function* () {
        const scheduleOpt = yield* scheduleRepo.findById(scheduleId, userId)
        if (Option.isNone(scheduleOpt)) {
          return null
        }

        const injections = yield* injectionLogRepo
          .listBySchedule(scheduleId, userId)
          .pipe(Effect.mapError((e) => ScheduleDatabaseError.make({ operation: e.operation, cause: e.cause })))
        const now = yield* DateTime.now

        return scheduleView(scheduleOpt.value, injections, now)
      })

    const getReminderCandidates = (now: DateTime.Utc) =>
      Effect.gen(function* () {
        const candidates: ActiveScheduleReminderCandidate[] = []
        for (const input of yield* scheduleRepo.listActiveReminderInputs()) {
          const nextScheduledDose = nextDose(input.schedule, input.lastInjectionDate, now)
          if (nextScheduledDose !== null) {
            candidates.push({
              userId: input.userId,
              email: input.email,
              name: input.name,
              nextScheduledDose,
              lastInjectionDate: input.lastInjectionDate,
              lastInjectionSite: input.lastInjectionSite,
            })
          }
        }

        return candidates
      })

    return { getNextScheduledDose, getScheduleView, getReminderCandidates }
  }),
)
