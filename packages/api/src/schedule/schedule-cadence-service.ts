import { SqlClient } from 'effect/unstable/sql'
import {
  Dosage,
  DrugName,
  DrugSource,
  Frequency,
  InjectionSchedule,
  InjectionScheduleId,
  nextDose,
  type NextScheduledDose,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleDatabaseError,
  ScheduleName,
  SchedulePhase,
  SchedulePhaseId,
  scheduleView,
  type ScheduleView,
} from '@subq/shared'
import { Context, DateTime, Effect, Layer, Option, Schema } from 'effect'
import { InjectionLogRepo } from '../injection/injection-log-repo.js'
import { ScheduleRepo } from './schedule-repo.js'

const ActiveScheduleReminderRow = Schema.Struct({
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

const decodeActiveScheduleReminderRow = Schema.decodeUnknownEffect(ActiveScheduleReminderRow)

interface ActiveScheduleAccumulator {
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

export interface ActiveScheduleReminderCandidate {
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly nextScheduledDose: NextScheduledDose
  readonly lastInjectionDate: DateTime.Utc | null
  readonly lastInjectionSite: string | null
}

const rowToPhase = (row: typeof ActiveScheduleReminderRow.Type): SchedulePhase | null => {
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

const accumulatorToSchedule = (accumulator: ActiveScheduleAccumulator): InjectionSchedule =>
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

const rowsToReminderCandidates = (
  rows: ReadonlyArray<typeof ActiveScheduleReminderRow.Type>,
  now: DateTime.Utc,
): ActiveScheduleReminderCandidate[] => {
  const schedules = new Map<string, ActiveScheduleAccumulator>()

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

  const candidates: ActiveScheduleReminderCandidate[] = []
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
    const sql = yield* SqlClient.SqlClient
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

        const decodedRows: Array<typeof ActiveScheduleReminderRow.Type> = []
        for (const row of rows) {
          decodedRows.push(yield* decodeActiveScheduleReminderRow(row))
        }

        return rowsToReminderCandidates(decodedRows, now)
      }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

    return { getNextScheduledDose, getScheduleView, getReminderCandidates }
  }),
)
