import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { InjectionLogRepoLive } from '../src/injection/injection-log-repo.js'
import { ReminderService, ReminderServiceLive } from '../src/reminders/reminder-service.js'
import { ScheduleCadenceServiceLive } from '../src/schedule/schedule-cadence-service.js'
import { ScheduleRepoLive } from '../src/schedule/schedule-repo.js'
import {
  insertInjectionLog,
  insertSchedule,
  insertSchedulePhase,
  insertUser,
  makeInitializedTestLayer,
} from './helpers/test-db.js'

const RepoLayer = Layer.mergeAll(ScheduleRepoLive, InjectionLogRepoLive)
const TestLayer = makeInitializedTestLayer(
  ReminderServiceLive.pipe(Layer.provide(ScheduleCadenceServiceLive), Layer.provide(RepoLayer)),
)
const MS_PER_DAY = 24 * 60 * 60 * 1000

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }
  return value
}

describe('ReminderService', () => {
  it.layer(TestLayer)((it) => {
    it.effect('uses the final titration phase after finite phases have elapsed', () =>
      Effect.gen(function* () {
        const now = new Date()
        const userId = 'user-1'
        const scheduleId = 'schedule-1'
        yield* TestClock.setTime(now.getTime())

        yield* insertUser(userId, 'user@example.com', 'Test User')
        yield* insertSchedule(
          scheduleId,
          'Semaglutide schedule',
          'Semaglutide',
          'weekly',
          new Date(now.getTime() - 20 * MS_PER_DAY),
          userId,
        )
        yield* insertSchedulePhase('phase-1', scheduleId, 1, '2.5mg', 7)
        yield* insertSchedulePhase('phase-2', scheduleId, 2, '5mg', 7)
        yield* insertInjectionLog(
          'injection-1',
          new Date(now.getTime() - 7 * MS_PER_DAY),
          'Semaglutide',
          '2.5mg',
          userId,
        )

        const service = yield* ReminderService
        const reminders = yield* service.getUsersDueToday()
        const reminder = requireValue(reminders[0])

        expect(reminders).toHaveLength(1)
        expect(reminder.dosage).toBe('5mg')
        expect(reminder.isOverdue).toBe(false)
      }),
    )
  })
})
