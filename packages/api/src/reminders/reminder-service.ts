import { SqlClient } from 'effect/unstable/sql'
import {
  Dosage,
  DrugName,
  DrugSource,
  Frequency,
  InjectionSchedule,
  InjectionScheduleId,
  nextDose,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhase,
  SchedulePhaseId,
} from '@subq/shared'
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

const ReminderScheduleRow = Schema.Struct({
  user_id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  schedule_id: Schema.String,
  schedule_name: Schema.String,
  schedule_drug: Schema.String,
  schedule_source: Schema.NullOr(Schema.String),
  schedule_frequency: Frequency,
  schedule_start_date: Schema.String,
  schedule_is_active: Schema.Number,
  schedule_notes: Schema.NullOr(Schema.String),
  schedule_created_at: Schema.String,
  schedule_updated_at: Schema.String,
  phase_id: Schema.NullOr(Schema.String),
  phase_schedule_id: Schema.NullOr(Schema.String),
  phase_order: Schema.NullOr(Schema.Number),
  phase_duration_days: Schema.NullOr(Schema.Number),
  phase_dosage: Schema.NullOr(Schema.String),
  phase_created_at: Schema.NullOr(Schema.String),
  phase_updated_at: Schema.NullOr(Schema.String),
  last_injection_date: Schema.NullOr(Schema.String),
  last_injection_site: Schema.NullOr(Schema.String),
})

const decodeReminderScheduleRow = Schema.decodeUnknownEffect(ReminderScheduleRow)

interface ReminderScheduleAccumulator {
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly scheduleId: string
  readonly scheduleName: string
  readonly drug: string
  readonly source: string | null
  readonly frequency: typeof Frequency.Type
  readonly startDate: string
  readonly isActive: number
  readonly notes: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly lastInjectionDate: DateTime.Utc | null
  readonly lastInjectionSite: string | null
  readonly phases: SchedulePhase[]
}

const rowToPhase = (row: typeof ReminderScheduleRow.Type): SchedulePhase | null => {
  if (
    row.phase_id === null ||
    row.phase_schedule_id === null ||
    row.phase_order === null ||
    row.phase_dosage === null ||
    row.phase_created_at === null ||
    row.phase_updated_at === null
  ) {
    return null
  }

  return new SchedulePhase({
    id: SchedulePhaseId.make(row.phase_id),
    scheduleId: InjectionScheduleId.make(row.phase_schedule_id),
    order: PhaseOrder.make(row.phase_order),
    durationDays: row.phase_duration_days === null ? null : PhaseDurationDays.make(row.phase_duration_days),
    dosage: Dosage.make(row.phase_dosage),
    createdAt: DateTime.makeUnsafe(row.phase_created_at),
    updatedAt: DateTime.makeUnsafe(row.phase_updated_at),
  })
}

const accumulatorToSchedule = (accumulator: ReminderScheduleAccumulator): InjectionSchedule =>
  new InjectionSchedule({
    id: InjectionScheduleId.make(accumulator.scheduleId),
    name: ScheduleName.make(accumulator.scheduleName),
    drug: DrugName.make(accumulator.drug),
    source: accumulator.source === null ? null : DrugSource.make(accumulator.source),
    frequency: accumulator.frequency,
    startDate: DateTime.makeUnsafe(accumulator.startDate),
    isActive: accumulator.isActive === 1,
    notes: accumulator.notes === null ? null : Notes.make(accumulator.notes),
    phases: accumulator.phases,
    createdAt: DateTime.makeUnsafe(accumulator.createdAt),
    updatedAt: DateTime.makeUnsafe(accumulator.updatedAt),
  })

const rowsToReminderCandidates = (rows: ReadonlyArray<typeof ReminderScheduleRow.Type>, now: DateTime.Utc) => {
  const schedules = new Map<string, ReminderScheduleAccumulator>()

  for (const row of rows) {
    let accumulator = schedules.get(row.user_id)
    if (accumulator === undefined) {
      accumulator = {
        userId: row.user_id,
        email: row.email,
        name: row.name,
        scheduleId: row.schedule_id,
        scheduleName: row.schedule_name,
        drug: row.schedule_drug,
        source: row.schedule_source,
        frequency: row.schedule_frequency,
        startDate: row.schedule_start_date,
        isActive: row.schedule_is_active,
        notes: row.schedule_notes,
        createdAt: row.schedule_created_at,
        updatedAt: row.schedule_updated_at,
        lastInjectionDate: row.last_injection_date === null ? null : DateTime.makeUnsafe(row.last_injection_date),
        lastInjectionSite: row.last_injection_site,
        phases: [],
      }
      schedules.set(row.user_id, accumulator)
    }

    const phase = rowToPhase(row)
    if (phase !== null) {
      accumulator.phases.push(phase)
    }
  }

  const candidates: ReminderCandidate[] = []
  for (const accumulator of schedules.values()) {
    const schedule = accumulatorToSchedule(accumulator)
    const nextScheduledDose = nextDose(schedule, accumulator.lastInjectionDate, now)
    if (nextScheduledDose !== null) {
      candidates.push({
        userId: accumulator.userId,
        email: accumulator.email,
        name: accumulator.name,
        nextScheduledDose,
        lastInjectionDate: accumulator.lastInjectionDate,
        lastInjectionSite: accumulator.lastInjectionSite,
      })
    }
  }

  return candidates
}

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

    const getReminderScheduleRows = () =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT 
            u.id as user_id,
            u.email,
            u.name,
            s.id as schedule_id,
            s.name as schedule_name,
            s.drug as schedule_drug,
            s.source as schedule_source,
            s.frequency as schedule_frequency,
            s.start_date as schedule_start_date,
            s.is_active as schedule_is_active,
            s.notes as schedule_notes,
            s.created_at as schedule_created_at,
            s.updated_at as schedule_updated_at,
            sp.id as phase_id,
            sp.schedule_id as phase_schedule_id,
            sp."order" as phase_order,
            sp.duration_days as phase_duration_days,
            sp.dosage as phase_dosage,
            sp.created_at as phase_created_at,
            sp.updated_at as phase_updated_at,
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
          LEFT JOIN schedule_phases sp ON sp.schedule_id = s.id
          WHERE (us.reminders_enabled = 1 OR us.reminders_enabled IS NULL)
          ORDER BY u.id, sp."order" ASC
        `

        const decodedRows: Array<typeof ReminderScheduleRow.Type> = []
        for (const row of rows) {
          decodedRows.push(yield* decodeReminderScheduleRow(row))
        }

        return decodedRows
      })

    const getUsersDueToday = (): Effect.Effect<PlannedReminder[], ReminderServiceError> =>
      Effect.gen(function* () {
        const rows = yield* getReminderScheduleRows()
        const now = DateTime.nowUnsafe()
        const usersDue: PlannedReminder[] = []

        for (const candidate of rowsToReminderCandidates(rows, now)) {
          const reminder = planReminderIfDue(candidate, now)

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
        const rows = yield* getReminderScheduleRows()
        const now = DateTime.nowUnsafe()
        const users: PlannedReminder[] = []

        for (const candidate of rowsToReminderCandidates(rows, now)) {
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
