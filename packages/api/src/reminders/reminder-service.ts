import { SqlClient } from 'effect/unstable/sql'
import { Frequency } from '@subq/shared'
import { Context, Data, DateTime, Effect, Layer, Schema } from 'effect'
import {
  planReminder,
  planReminderIfDue,
  type ReminderCandidate,
  type UserDueForReminder as PlannedReminder,
} from './reminder-planner.js'

export type { UserDueForReminder } from './reminder-planner.js'

export class ReminderServiceError extends Data.TaggedError('ReminderServiceError')<{
  message: string
  cause?: unknown
}> {}

// ============================================
// Database Row Schema
// ============================================

const UserScheduleRow = Schema.Struct({
  user_id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  drug: Schema.String,
  dosage: Schema.String,
  frequency: Frequency,
  start_date: Schema.String,
  last_injection_date: Schema.NullOr(Schema.String),
  last_injection_site: Schema.NullOr(Schema.String),
})

const decodeUserScheduleRow = Schema.decodeUnknownEffect(UserScheduleRow)

const rowToReminderCandidate = (row: typeof UserScheduleRow.Type): ReminderCandidate => ({
  userId: row.user_id,
  email: row.email,
  name: row.name,
  drug: row.drug,
  dosage: row.dosage,
  frequency: row.frequency,
  startDate: DateTime.makeUnsafe(row.start_date),
  lastInjectionDate: row.last_injection_date === null ? null : DateTime.makeUnsafe(row.last_injection_date),
  lastInjectionSite: row.last_injection_site,
})

// ============================================
// Service Definition
// ============================================

export class ReminderService extends Context.Service<
  ReminderService,
  {
    readonly getUsersDueToday: () => Effect.Effect<PlannedReminder[], ReminderServiceError>
    readonly getAllUsersWithActiveSchedule: () => Effect.Effect<PlannedReminder[], ReminderServiceError>
  }
>()('ReminderService') {}

// ============================================
// Service Implementation
// ============================================

export const ReminderServiceLive = Layer.effect(
  ReminderService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const getUsersDueToday = (): Effect.Effect<PlannedReminder[], ReminderServiceError> =>
      Effect.gen(function* () {
        // Query users with:
        // - Active schedule
        // - Reminders enabled (or no settings yet, default to enabled)
        // - At least one phase
        // Join with their last injection date for the drug
        const rows = yield* sql`
          SELECT 
            u.id as user_id,
            u.email,
            u.name,
            s.drug,
            sp.dosage,
            s.frequency,
            s.start_date,
            (
              SELECT il.datetime 
              FROM injection_logs il 
              WHERE il.user_id = u.id AND il.drug = s.drug 
              ORDER BY il.datetime DESC 
              LIMIT 1
            ) as last_injection_date,
            (
              SELECT il.injection_site 
              FROM injection_logs il 
              WHERE il.user_id = u.id 
              ORDER BY il.datetime DESC 
              LIMIT 1
            ) as last_injection_site
          FROM "user" u
          LEFT JOIN user_settings us ON us.user_id = u.id
          JOIN injection_schedules s ON s.user_id = u.id AND s.is_active = 1
          JOIN schedule_phases sp ON sp.schedule_id = s.id
          WHERE (us.reminders_enabled = 1 OR us.reminders_enabled IS NULL)
          AND sp."order" = (
            SELECT MIN(sp2."order") 
            FROM schedule_phases sp2 
            WHERE sp2.schedule_id = s.id
            AND (
              sp2.duration_days IS NULL 
              OR (
                julianday('now') - julianday(s.start_date) < 
                (SELECT SUM(COALESCE(sp3.duration_days, 0)) 
                 FROM schedule_phases sp3 
                 WHERE sp3.schedule_id = s.id AND sp3."order" <= sp2."order")
              )
            )
          )
        `

        const now = DateTime.nowUnsafe()
        const usersDue: PlannedReminder[] = []

        for (const row of rows) {
          const decoded = yield* decodeUserScheduleRow(row)
          const reminder = planReminderIfDue(rowToReminderCandidate(decoded), now)

          if (reminder !== null) {
            usersDue.push(reminder)
          }
        }

        yield* Effect.logInfo('getUsersDueToday completed').pipe(Effect.annotateLogs({ usersFound: usersDue.length }))

        return usersDue
      }).pipe(Effect.mapError((cause) => new ReminderServiceError({ message: 'Failed to get users due today', cause })))

    // For testing: get all users with active schedules (ignores due date filter)
    const getAllUsersWithActiveSchedule = (): Effect.Effect<PlannedReminder[], ReminderServiceError> =>
      Effect.gen(function* () {
        // LEFT JOIN user_settings since users may not have settings yet (default to reminders enabled)
        // Use same query structure as getUsersDueToday to get proper data
        const rows = yield* sql`
          SELECT 
            u.id as user_id,
            u.email,
            u.name,
            s.drug,
            sp.dosage,
            s.frequency,
            s.start_date,
            (
              SELECT il.datetime 
              FROM injection_logs il 
              WHERE il.user_id = u.id AND il.drug = s.drug 
              ORDER BY il.datetime DESC 
              LIMIT 1
            ) as last_injection_date,
            (
              SELECT il.injection_site 
              FROM injection_logs il 
              WHERE il.user_id = u.id 
              ORDER BY il.datetime DESC 
              LIMIT 1
            ) as last_injection_site
          FROM "user" u
          LEFT JOIN user_settings us ON us.user_id = u.id
          JOIN injection_schedules s ON s.user_id = u.id AND s.is_active = 1
          JOIN schedule_phases sp ON sp.schedule_id = s.id
          WHERE (us.reminders_enabled = 1 OR us.reminders_enabled IS NULL)
          AND sp."order" = (
            SELECT MIN(sp2."order") 
            FROM schedule_phases sp2 
            WHERE sp2.schedule_id = s.id
            AND (
              sp2.duration_days IS NULL 
              OR (
                julianday('now') - julianday(s.start_date) < 
                (SELECT SUM(COALESCE(sp3.duration_days, 0)) 
                 FROM schedule_phases sp3 
                 WHERE sp3.schedule_id = s.id AND sp3."order" <= sp2."order")
              )
            )
          )
        `

        const now = DateTime.nowUnsafe()
        const users: PlannedReminder[] = []

        for (const row of rows) {
          const decoded = yield* decodeUserScheduleRow(row)
          users.push(planReminder(rowToReminderCandidate(decoded), now))
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
