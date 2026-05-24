import { SqlClient } from 'effect/unstable/sql'
import {
  type InjectionLogBulkAssignSchedule,
  InjectionLogDatabaseError,
  ScheduleAssignmentTargetNotFoundError,
} from '@subq/shared'
import { Context, DateTime, Effect, Layer, Schema } from 'effect'

const CountRow = Schema.Struct({ count: Schema.Number })
const decodeCountRow = Schema.decodeUnknownEffect(CountRow)

export class ScheduleAssignment extends Context.Service<
  ScheduleAssignment,
  {
    readonly assign: (
      data: InjectionLogBulkAssignSchedule,
      userId: string,
    ) => Effect.Effect<number, InjectionLogDatabaseError | ScheduleAssignmentTargetNotFoundError>
  }
>()('ScheduleAssignment') {}

export const ScheduleAssignmentLive = Layer.effect(
  ScheduleAssignment,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const countRowsForUser = (ids: readonly string[], userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT COUNT(*) as count FROM injection_logs
          WHERE id IN ${sql.in(ids)} AND user_id = ${userId}
        `
        const row = yield* decodeCountRow(rows[0])
        return row.count
      }).pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'query', cause })))

    const requireScheduleOwnedByUser = (scheduleId: string, userId: string) =>
      Effect.gen(function* () {
        const row = yield* Effect.gen(function* () {
          const rows = yield* sql`
            SELECT COUNT(*) as count FROM injection_schedules
            WHERE id = ${scheduleId} AND user_id = ${userId}
          `
          return yield* decodeCountRow(rows[0])
        }).pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'query', cause })))

        if (row.count === 0) {
          return yield* Effect.fail(ScheduleAssignmentTargetNotFoundError.make({ scheduleId }))
        }
      })

    const assign = (data: InjectionLogBulkAssignSchedule, userId: string) =>
      Effect.gen(function* () {
        if (data.ids.length === 0) return 0

        if (data.scheduleId !== null) {
          yield* requireScheduleOwnedByUser(data.scheduleId, userId)
        }

        const now = DateTime.formatIso(DateTime.nowUnsafe())
        const scheduleId = data.scheduleId

        yield* sql`
          UPDATE injection_logs
          SET schedule_id = ${scheduleId},
              updated_at = ${now}
          WHERE id IN ${sql.in(data.ids)} AND user_id = ${userId}
        `.pipe(Effect.mapError((cause) => InjectionLogDatabaseError.make({ operation: 'update', cause })))

        return yield* countRowsForUser(data.ids, userId)
      })

    return { assign }
  }),
)
