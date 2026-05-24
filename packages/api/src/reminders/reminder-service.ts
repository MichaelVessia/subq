import { Context, Data, DateTime, Effect, Layer } from 'effect'
import { ScheduleCadenceService } from '../schedule/schedule-cadence-service.js'
import { planReminder, planReminderIfDue, type UserDueForReminder as PlannedReminder } from './reminder-planner.js'

export type { UserDueForReminder } from './reminder-planner.js'

export class ReminderServiceError extends Data.TaggedError('ReminderServiceError')<{
  message: string
  cause?: unknown
}> {}

export class ReminderService extends Context.Service<
  ReminderService,
  {
    readonly getUsersDueToday: () => Effect.Effect<PlannedReminder[], ReminderServiceError>
    readonly getAllUsersWithActiveSchedule: () => Effect.Effect<PlannedReminder[], ReminderServiceError>
  }
>()('ReminderService') {}

export const ReminderServiceLive = Layer.effect(
  ReminderService,
  Effect.gen(function* () {
    const scheduleCadence = yield* ScheduleCadenceService

    const getUsersDueToday = (): Effect.Effect<PlannedReminder[], ReminderServiceError> =>
      Effect.gen(function* () {
        const now = yield* DateTime.now
        const usersDue: PlannedReminder[] = []

        for (const candidate of yield* scheduleCadence.getReminderCandidates(now)) {
          const reminder = planReminderIfDue(candidate, now)
          if (reminder !== null) {
            usersDue.push(reminder)
          }
        }

        yield* Effect.logInfo('getUsersDueToday completed').pipe(Effect.annotateLogs({ usersFound: usersDue.length }))

        return usersDue
      }).pipe(Effect.mapError((cause) => new ReminderServiceError({ message: 'Failed to get users due today', cause })))

    const getAllUsersWithActiveSchedule = (): Effect.Effect<PlannedReminder[], ReminderServiceError> =>
      Effect.gen(function* () {
        const now = yield* DateTime.now
        const users: PlannedReminder[] = []

        for (const candidate of yield* scheduleCadence.getReminderCandidates(now)) {
          users.push(planReminder(candidate, now))
        }

        yield* Effect.logInfo('getAllUsersWithActiveSchedule completed').pipe(
          Effect.annotateLogs({ usersFound: users.length }),
        )

        return users
      }).pipe(
        Effect.tapError((cause) =>
          Effect.logError('getAllUsersWithActiveSchedule failed').pipe(
            Effect.annotateLogs({ cause: String(cause), causeJson: JSON.stringify(cause) }),
          ),
        ),
        Effect.mapError(
          (cause) => new ReminderServiceError({ message: 'Failed to get users with active schedule', cause }),
        ),
      )

    return { getUsersDueToday, getAllUsersWithActiveSchedule }
  }),
)
