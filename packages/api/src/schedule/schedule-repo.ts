import { SqlClient } from 'effect/unstable/sql'
import {
  Dosage,
  Frequency,
  DrugName,
  DrugSource,
  InjectionSchedule,
  type InjectionScheduleCreate,
  InjectionScheduleId,
  type InjectionScheduleUpdate,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleDatabaseError,
  ScheduleName,
  ScheduleNotFoundError,
  SchedulePhase,
  type SchedulePhaseCreate,
  SchedulePhaseId,
} from '@subq/shared'
import { Context, DateTime, Effect, Layer, Option, Schema } from 'effect'

// ============================================
// Database Row Schemas
// ============================================

const ScheduleRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  drug: Schema.String,
  source: Schema.NullOr(Schema.String),
  frequency: Schema.String,
  start_date: Schema.String,
  is_active: Schema.Number, // SQLite boolean as 0/1
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const DatetimeRow = Schema.Struct({
  datetime: Schema.String,
})
const decodeDatetimeRow = Schema.decodeUnknownEffect(DatetimeRow)

const PhaseRow = Schema.Struct({
  id: Schema.String,
  schedule_id: Schema.String,
  order: Schema.Number,
  duration_days: Schema.NullOr(Schema.Number),
  dosage: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
})

// Schema for joined schedule + phase rows (single query with LEFT JOIN)
const ScheduleWithPhaseRow = Schema.Struct({
  // Schedule fields
  id: Schema.String,
  name: Schema.String,
  drug: Schema.String,
  source: Schema.NullOr(Schema.String),
  frequency: Schema.String,
  start_date: Schema.String,
  is_active: Schema.Number,
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  // Phase fields (nullable for schedules with no phases)
  phase_id: Schema.NullOr(Schema.String),
  phase_schedule_id: Schema.NullOr(Schema.String),
  phase_order: Schema.NullOr(Schema.Number),
  phase_duration_days: Schema.NullOr(Schema.Number),
  phase_dosage: Schema.NullOr(Schema.String),
  phase_created_at: Schema.NullOr(Schema.String),
  phase_updated_at: Schema.NullOr(Schema.String),
})

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

const decodeScheduleRow = Schema.decodeUnknownEffect(ScheduleRow)
const decodePhaseRow = Schema.decodeUnknownEffect(PhaseRow)
const decodeScheduleWithPhaseRow = Schema.decodeUnknownEffect(ScheduleWithPhaseRow)
const decodeActiveScheduleReminderRow = Schema.decodeUnknownEffect(ActiveScheduleReminderRow)

export interface ActiveScheduleReminderInput {
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly schedule: InjectionSchedule
  readonly lastInjectionDate: DateTime.Utc | null
  readonly lastInjectionSite: string | null
}

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

const phaseRowToDomain = (row: typeof PhaseRow.Type): SchedulePhase =>
  new SchedulePhase({
    id: SchedulePhaseId.make(row.id),
    scheduleId: InjectionScheduleId.make(row.schedule_id),
    order: row.order as PhaseOrder,
    durationDays: row.duration_days as PhaseDurationDays | null,
    dosage: Dosage.make(row.dosage),
    createdAt: DateTime.makeUnsafe(row.created_at),
    updatedAt: DateTime.makeUnsafe(row.updated_at),
  })

const scheduleRowToDomain = (row: typeof ScheduleRow.Type, phases: SchedulePhase[]): InjectionSchedule =>
  new InjectionSchedule({
    id: InjectionScheduleId.make(row.id),
    name: ScheduleName.make(row.name),
    drug: DrugName.make(row.drug),
    source: row.source ? DrugSource.make(row.source) : null,
    frequency: row.frequency as Frequency,
    startDate: DateTime.makeUnsafe(row.start_date),
    isActive: row.is_active === 1,
    notes: row.notes ? Notes.make(row.notes) : null,
    phases,
    createdAt: DateTime.makeUnsafe(row.created_at),
    updatedAt: DateTime.makeUnsafe(row.updated_at),
  })

const reminderRowToPhase = (row: typeof ActiveScheduleReminderRow.Type): SchedulePhase | null => {
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

const reminderAccumulatorToSchedule = (accumulator: ActiveScheduleAccumulator): InjectionSchedule =>
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

const reminderRowToAccumulator = (row: typeof ActiveScheduleReminderRow.Type): ActiveScheduleAccumulator => ({
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
})

const rowsToReminderInputs = (
  rows: ReadonlyArray<typeof ActiveScheduleReminderRow.Type>,
): ActiveScheduleReminderInput[] => {
  const schedules = new Map<string, ActiveScheduleAccumulator>()

  for (const row of rows) {
    const existing = schedules.get(row.schedule_id)
    const accumulator = existing ?? reminderRowToAccumulator(row)
    if (existing === undefined) {
      schedules.set(row.schedule_id, accumulator)
    }

    const phase = reminderRowToPhase(row)
    if (phase !== null) {
      accumulator.phases.push(phase)
    }
  }

  return Array.from(schedules.values()).map((accumulator) => ({
    userId: accumulator.userId,
    email: accumulator.email,
    name: accumulator.name,
    schedule: reminderAccumulatorToSchedule(accumulator),
    lastInjectionDate: accumulator.lastInjectionDate,
    lastInjectionSite: accumulator.lastInjectionSite,
  }))
}

// Helper to group joined rows into schedules with phases (avoids N+1 queries)
const groupSchedulesWithPhases = (rows: Array<typeof ScheduleWithPhaseRow.Type>): InjectionSchedule[] => {
  const scheduleMap = new Map<string, { schedule: typeof ScheduleRow.Type; phases: SchedulePhase[] }>()

  for (const row of rows) {
    if (!scheduleMap.has(row.id)) {
      scheduleMap.set(row.id, {
        schedule: {
          id: row.id,
          name: row.name,
          drug: row.drug,
          source: row.source,
          frequency: row.frequency,
          start_date: row.start_date,
          is_active: row.is_active,
          notes: row.notes,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        phases: [],
      })
    }

    // Add phase if it exists (LEFT JOIN may return null phase columns)
    if (row.phase_id && row.phase_schedule_id && row.phase_dosage && row.phase_created_at && row.phase_updated_at) {
      const entry = scheduleMap.get(row.id)!
      entry.phases.push(
        new SchedulePhase({
          id: SchedulePhaseId.make(row.phase_id),
          scheduleId: InjectionScheduleId.make(row.phase_schedule_id),
          order: (row.phase_order ?? 0) as PhaseOrder,
          durationDays: row.phase_duration_days as PhaseDurationDays | null,
          dosage: Dosage.make(row.phase_dosage),
          createdAt: DateTime.makeUnsafe(row.phase_created_at),
          updatedAt: DateTime.makeUnsafe(row.phase_updated_at),
        }),
      )
    }
  }

  return Array.from(scheduleMap.values()).map(({ schedule, phases }) => scheduleRowToDomain(schedule, phases))
}

const generateUuid = () => crypto.randomUUID()

// ============================================
// Repository Service Definition
// ============================================

export class ScheduleRepo extends Context.Service<
  ScheduleRepo,
  {
    readonly list: (userId: string) => Effect.Effect<InjectionSchedule[], ScheduleDatabaseError>
    readonly getActive: (userId: string) => Effect.Effect<Option.Option<InjectionSchedule>, ScheduleDatabaseError>
    readonly findById: (
      id: string,
      userId: string,
    ) => Effect.Effect<Option.Option<InjectionSchedule>, ScheduleDatabaseError>
    readonly create: (
      data: InjectionScheduleCreate,
      userId: string,
    ) => Effect.Effect<InjectionSchedule, ScheduleDatabaseError>
    readonly update: (
      data: InjectionScheduleUpdate,
      userId: string,
    ) => Effect.Effect<InjectionSchedule, ScheduleNotFoundError | ScheduleDatabaseError>
    readonly delete: (id: string, userId: string) => Effect.Effect<boolean, ScheduleDatabaseError>
    readonly getLastInjectionDate: (
      userId: string,
      drug: string,
    ) => Effect.Effect<Option.Option<DateTime.Utc>, ScheduleDatabaseError>
    readonly listActiveReminderInputs: () => Effect.Effect<ActiveScheduleReminderInput[], ScheduleDatabaseError>
  }
>()('ScheduleRepo') {}

// ============================================
// Repository Implementation
// ============================================

export const ScheduleRepoLive = Layer.effect(
  ScheduleRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // Helper to load phases for a single schedule (used for create/update)
    const loadPhases = (scheduleId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT id, schedule_id, "order", duration_days, dosage, created_at, updated_at
          FROM schedule_phases
          WHERE schedule_id = ${scheduleId}
          ORDER BY "order" ASC
        `
        const decoded = yield* Effect.all(rows.map((r) => decodePhaseRow(r)))
        return decoded.map(phaseRowToDomain)
      })

    // Helper to create phases for a schedule
    const createPhases = (scheduleId: string, phases: readonly SchedulePhaseCreate[]) =>
      Effect.gen(function* () {
        const now = DateTime.formatIso(DateTime.nowUnsafe())
        for (const phase of phases) {
          const phaseId = generateUuid()
          yield* sql`
            INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)
            VALUES (${phaseId}, ${scheduleId}, ${phase.order}, ${phase.durationDays}, ${phase.dosage}, ${now}, ${now})
          `
        }
      })

    // Helper to delete phases for a schedule
    const deletePhases = (scheduleId: string) => sql`DELETE FROM schedule_phases WHERE schedule_id = ${scheduleId}`

    // Single query to fetch schedules with phases using LEFT JOIN
    const list = (userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT 
            s.id, s.name, s.drug, s.source, s.frequency, s.start_date, s.is_active, s.notes, s.created_at, s.updated_at,
            p.id as phase_id, p.schedule_id as phase_schedule_id, p."order" as phase_order, 
            p.duration_days as phase_duration_days, p.dosage as phase_dosage,
            p.created_at as phase_created_at, p.updated_at as phase_updated_at
          FROM injection_schedules s
          LEFT JOIN schedule_phases p ON s.id = p.schedule_id
          WHERE s.user_id = ${userId}
          ORDER BY s.start_date DESC, p."order" ASC
        `
        const decoded = yield* Effect.all(rows.map((r) => decodeScheduleWithPhaseRow(r)))
        return groupSchedulesWithPhases(decoded)
      }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

    // Single query to fetch active schedule with phases using LEFT JOIN
    const getActive = (userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT 
            s.id, s.name, s.drug, s.source, s.frequency, s.start_date, s.is_active, s.notes, s.created_at, s.updated_at,
            p.id as phase_id, p.schedule_id as phase_schedule_id, p."order" as phase_order,
            p.duration_days as phase_duration_days, p.dosage as phase_dosage,
            p.created_at as phase_created_at, p.updated_at as phase_updated_at
          FROM injection_schedules s
          LEFT JOIN schedule_phases p ON s.id = p.schedule_id
          WHERE s.user_id = ${userId} AND s.is_active = 1
          ORDER BY p."order" ASC
        `
        if (rows.length === 0) {
          return Option.none()
        }
        const decoded = yield* Effect.all(rows.map((r) => decodeScheduleWithPhaseRow(r)))
        const schedules = groupSchedulesWithPhases(decoded)
        return Option.fromNullishOr(schedules[0])
      }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

    // Single query to fetch schedule by ID with phases using LEFT JOIN
    const findById = (id: string, userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT 
            s.id, s.name, s.drug, s.source, s.frequency, s.start_date, s.is_active, s.notes, s.created_at, s.updated_at,
            p.id as phase_id, p.schedule_id as phase_schedule_id, p."order" as phase_order,
            p.duration_days as phase_duration_days, p.dosage as phase_dosage,
            p.created_at as phase_created_at, p.updated_at as phase_updated_at
          FROM injection_schedules s
          LEFT JOIN schedule_phases p ON s.id = p.schedule_id
          WHERE s.id = ${id} AND s.user_id = ${userId}
          ORDER BY p."order" ASC
        `
        if (rows.length === 0) {
          return Option.none()
        }
        const decoded = yield* Effect.all(rows.map((r) => decodeScheduleWithPhaseRow(r)))
        const schedules = groupSchedulesWithPhases(decoded)
        return Option.fromNullishOr(schedules[0])
      }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

    const create = (data: InjectionScheduleCreate, userId: string) =>
      Effect.gen(function* () {
        const id = generateUuid()
        const source = Option.isSome(data.source) ? data.source.value : null
        const notes = Option.isSome(data.notes) ? data.notes.value : null
        const now = DateTime.formatIso(DateTime.nowUnsafe())
        const startDateStr = DateTime.formatIso(data.startDate)

        // Deactivate any existing active schedules for this user
        yield* sql`UPDATE injection_schedules SET is_active = 0, updated_at = ${now} WHERE user_id = ${userId} AND is_active = 1`

        // Create the schedule
        yield* sql`
          INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)
          VALUES (${id}, ${data.name}, ${data.drug}, ${source}, ${data.frequency}, ${startDateStr}, 1, ${notes}, ${userId}, ${now}, ${now})
        `

        // Create phases
        yield* createPhases(id, data.phases)

        // Fetch and return
        const rows = yield* sql`
          SELECT id, name, drug, source, frequency, start_date, is_active, notes, created_at, updated_at
          FROM injection_schedules
          WHERE id = ${id}
        `
        const decoded = yield* decodeScheduleRow(rows[0])
        const phases = yield* loadPhases(id)
        return scheduleRowToDomain(decoded, phases)
      }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'insert', cause })))

    const update = (data: InjectionScheduleUpdate, userId: string) =>
      Effect.gen(function* () {
        // First get current values - include user_id check to prevent IDOR
        const current = yield* sql`
          SELECT id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at
          FROM injection_schedules WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

        if (current.length === 0) {
          return yield* Effect.fail(ScheduleNotFoundError.make({ id: data.id }))
        }

        const curr = yield* decodeScheduleRow(current[0]).pipe(
          Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })),
        )

        const newName = data.name ?? curr.name
        const newDrug = data.drug ?? curr.drug
        const newSource = data.source !== undefined ? data.source : curr.source
        const newFrequency = data.frequency ?? curr.frequency
        const newStartDate = data.startDate ? DateTime.formatIso(data.startDate) : curr.start_date
        const newIsActive = data.isActive ?? curr.is_active === 1
        const newNotes = data.notes !== undefined ? data.notes : curr.notes
        const now = DateTime.formatIso(DateTime.nowUnsafe())

        // If activating this schedule, deactivate others
        if (newIsActive && curr.is_active !== 1) {
          yield* sql`
            UPDATE injection_schedules SET is_active = 0, updated_at = ${now} 
            WHERE user_id = ${userId} AND is_active = 1 AND id != ${data.id}
          `.pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'update', cause })))
        }

        yield* sql`
          UPDATE injection_schedules
          SET name = ${newName},
              drug = ${newDrug},
              source = ${newSource},
              frequency = ${newFrequency},
              start_date = ${newStartDate},
              is_active = ${newIsActive ? 1 : 0},
              notes = ${newNotes},
              updated_at = ${now}
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'update', cause })))

        // Update phases if provided
        if (data.phases) {
          yield* deletePhases(data.id).pipe(
            Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'delete', cause })),
          )
          yield* createPhases(data.id, data.phases).pipe(
            Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'insert', cause })),
          )
        }

        // Fetch updated
        const rows = yield* sql`
          SELECT id, name, drug, source, frequency, start_date, is_active, notes, created_at, updated_at
          FROM injection_schedules
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

        const decoded = yield* decodeScheduleRow(rows[0]).pipe(
          Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })),
        )
        const phases = yield* loadPhases(data.id).pipe(
          Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })),
        )
        return scheduleRowToDomain(decoded, phases)
      })

    const del = (id: string, userId: string) =>
      Effect.gen(function* () {
        const existing = yield* sql`SELECT id FROM injection_schedules WHERE id = ${id} AND user_id = ${userId}`
        if (existing.length === 0) {
          return false
        }
        // Phases are deleted via CASCADE
        yield* sql`DELETE FROM injection_schedules WHERE id = ${id} AND user_id = ${userId}`
        return true
      }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'delete', cause })))

    const getLastInjectionDate = (userId: string, drug: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT datetime FROM injection_logs
          WHERE user_id = ${userId} AND drug = ${drug}
          ORDER BY datetime DESC
          LIMIT 1
        `
        const row = rows[0]
        if (!row) {
          return Option.none()
        }
        const decoded = yield* decodeDatetimeRow(row)
        return Option.some(DateTime.makeUnsafe(decoded.datetime))
      }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

    const listActiveReminderInputs = () =>
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

        const decoded = yield* Effect.all(rows.map((row) => decodeActiveScheduleReminderRow(row)))
        return rowsToReminderInputs(decoded)
      }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

    return {
      list,
      getActive,
      findById,
      create,
      update,
      delete: del,
      getLastInjectionDate,
      listActiveReminderInputs,
    }
  }),
)
