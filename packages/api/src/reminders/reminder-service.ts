import { SqlClient } from '@effect/sql'
import { Data, DateTime, Effect, Layer, Schema } from 'effect'

// ============================================
// Types
// ============================================

export interface UserDueForReminder {
  userId: string
  email: string
  name: string
  drug: string
  dosage: string
  daysSinceLastInjection: number | null // null = first injection
  lastInjectionSite: string | null
  isOverdue: boolean
  daysOverdue: number // 0 if not overdue
}

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
  frequency: Schema.String,
  start_date: Schema.String,
  last_injection_date: Schema.NullOr(Schema.String),
  last_injection_site: Schema.NullOr(Schema.String),
})

const decodeUserScheduleRow = Schema.decodeUnknown(UserScheduleRow)

// Frequency to days mapping
const frequencyToDays = (frequency: string): number => {
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

// ============================================
// Service Definition
// ============================================

export class ReminderService extends Effect.Tag('ReminderService')<
  ReminderService,
  {
    readonly getUsersDueToday: () => Effect.Effect<UserDueForReminder[], ReminderServiceError>
    readonly getAllUsersWithActiveSchedule: () => Effect.Effect<UserDueForReminder[], ReminderServiceError>
  }
>() {}

// ============================================
// Service Implementation
// ============================================

export const ReminderServiceLive = Layer.effect(
  ReminderService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const getUsersDueToday = (): Effect.Effect<UserDueForReminder[], ReminderServiceError> =>
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

        const now = DateTime.unsafeNow()
        const msPerDay = 1000 * 60 * 60 * 24
        const usersDue: UserDueForReminder[] = []

        for (const row of rows) {
          const decoded = yield* decodeUserScheduleRow(row)
          const intervalDays = frequencyToDays(decoded.frequency)

          let suggestedDate: DateTime.Utc
          let daysSinceLastInjection: number | null = null

          if (!decoded.last_injection_date) {
            // No injections yet - due on start date or today (whichever is later)
            const startDate = DateTime.unsafeMake(decoded.start_date)
            suggestedDate = DateTime.greaterThan(now, startDate) ? now : startDate
          } else {
            const lastInjection = DateTime.unsafeMake(decoded.last_injection_date)
            suggestedDate = DateTime.unsafeMake(DateTime.toEpochMillis(lastInjection) + intervalDays * msPerDay)
            daysSinceLastInjection = Math.round(
              (DateTime.toEpochMillis(now) - DateTime.toEpochMillis(lastInjection)) / msPerDay,
            )
          }

          const daysUntilDue = Math.round(
            (DateTime.toEpochMillis(suggestedDate) - DateTime.toEpochMillis(now)) / msPerDay,
          )

          const isOverdue = daysUntilDue < 0
          const daysOverdue = isOverdue ? Math.abs(daysUntilDue) : 0

          // Due today (daysUntilDue <= 0) through 7 days overdue (daysUntilDue >= -7)
          // Stop emailing after 7 days overdue to avoid spamming inactive users
          if (daysUntilDue <= 0 && daysUntilDue >= -7) {
            usersDue.push({
              userId: decoded.user_id,
              email: decoded.email,
              name: decoded.name,
              drug: decoded.drug,
              dosage: decoded.dosage,
              daysSinceLastInjection,
              lastInjectionSite: decoded.last_injection_site,
              isOverdue,
              daysOverdue,
            })
          }
        }

        yield* Effect.logInfo('getUsersDueToday completed').pipe(Effect.annotateLogs({ usersFound: usersDue.length }))

        return usersDue
      }).pipe(Effect.mapError((cause) => new ReminderServiceError({ message: 'Failed to get users due today', cause })))

    // For testing: get all users with active schedules (ignores due date)
    const getAllUsersWithActiveSchedule = (): Effect.Effect<UserDueForReminder[], ReminderServiceError> =>
      Effect.gen(function* () {
        // LEFT JOIN user_settings since users may not have settings yet (default to reminders enabled)
        const rows = yield* sql`
          SELECT 
            u.id as user_id,
            u.email,
            u.name,
            s.drug,
            sp.dosage,
            s.frequency,
            s.start_date,
            NULL as last_injection_date,
            NULL as last_injection_site
          FROM "user" u
          LEFT JOIN user_settings us ON us.user_id = u.id
          JOIN injection_schedules s ON s.user_id = u.id AND s.is_active = 1
          JOIN schedule_phases sp ON sp.schedule_id = s.id
          WHERE (us.reminders_enabled = 1 OR us.reminders_enabled IS NULL)
          AND sp."order" = 1
        `

        const users: UserDueForReminder[] = []
        for (const row of rows) {
          const decoded = yield* decodeUserScheduleRow(row)
          users.push({
            userId: decoded.user_id,
            email: decoded.email,
            name: decoded.name,
            drug: decoded.drug,
            dosage: decoded.dosage,
            daysSinceLastInjection: null, // Not computed for test endpoint
            lastInjectionSite: null,
            isOverdue: false,
            daysOverdue: 0,
          })
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
