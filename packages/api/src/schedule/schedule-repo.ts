import { SqlClient } from '@effect/sql'
import {
  Dosage,
  DrugName,
  DrugSource,
  type Frequency,
  InjectionSchedule,
  type InjectionScheduleCreate,
  InjectionScheduleId,
  type InjectionScheduleUpdate,
  Notes,
  type PhaseDurationDays,
  type PhaseOrder,
  ScheduleDatabaseError,
  ScheduleName,
  ScheduleNotFoundError,
  SchedulePhase,
  type SchedulePhaseCreate,
  SchedulePhaseId,
} from '@subq/shared'
import { DateTime, Effect, Layer, Option, Schema } from 'effect'

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

const decodeScheduleRow = Schema.decodeUnknown(ScheduleRow)
const decodePhaseRow = Schema.decodeUnknown(PhaseRow)
const decodeScheduleWithPhaseRow = Schema.decodeUnknown(ScheduleWithPhaseRow)

const phaseRowToDomain = (row: typeof PhaseRow.Type): SchedulePhase =>
  new SchedulePhase({
    id: SchedulePhaseId.make(row.id),
    scheduleId: InjectionScheduleId.make(row.schedule_id),
    order: row.order as PhaseOrder,
    durationDays: row.duration_days as PhaseDurationDays | null,
    dosage: Dosage.make(row.dosage),
    createdAt: DateTime.unsafeMake(row.created_at),
    updatedAt: DateTime.unsafeMake(row.updated_at),
  })

const scheduleRowToDomain = (row: typeof ScheduleRow.Type, phases: SchedulePhase[]): InjectionSchedule =>
  new InjectionSchedule({
    id: InjectionScheduleId.make(row.id),
    name: ScheduleName.make(row.name),
    drug: DrugName.make(row.drug),
    source: row.source ? DrugSource.make(row.source) : null,
    frequency: row.frequency as Frequency,
    startDate: DateTime.unsafeMake(row.start_date),
    isActive: row.is_active === 1,
    notes: row.notes ? Notes.make(row.notes) : null,
    phases,
    createdAt: DateTime.unsafeMake(row.created_at),
    updatedAt: DateTime.unsafeMake(row.updated_at),
  })

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
          createdAt: DateTime.unsafeMake(row.phase_created_at),
          updatedAt: DateTime.unsafeMake(row.phase_updated_at),
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

export class ScheduleRepo extends Effect.Tag('ScheduleRepo')<
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
  }
>() {}

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
        const now = DateTime.formatIso(DateTime.unsafeNow())
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
        return Option.fromNullable(schedules[0])
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
        return Option.fromNullable(schedules[0])
      }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

    const create = (data: InjectionScheduleCreate, userId: string) =>
      Effect.gen(function* () {
        const id = generateUuid()
        const source = Option.isSome(data.source) ? data.source.value : null
        const notes = Option.isSome(data.notes) ? data.notes.value : null
        const now = DateTime.formatIso(DateTime.unsafeNow())
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
          return yield* ScheduleNotFoundError.make({ id: data.id })
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
        const now = DateTime.formatIso(DateTime.unsafeNow())

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
        const rows = yield* sql<{ datetime: string }>`
          SELECT datetime FROM injection_logs 
          WHERE user_id = ${userId} AND drug = ${drug}
          ORDER BY datetime DESC
          LIMIT 1
        `
        const row = rows[0]
        if (!row) {
          return Option.none()
        }
        return Option.some(DateTime.unsafeMake(row.datetime))
      }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

    return {
      list,
      getActive,
      findById,
      create,
      update,
      delete: del,
      getLastInjectionDate,
    }
  }),
)
