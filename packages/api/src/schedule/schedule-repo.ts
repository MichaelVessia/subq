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
import { Effect, Layer, Option, Schema } from 'effect'

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

const decodeScheduleRow = Schema.decodeUnknown(ScheduleRow)
const decodePhaseRow = Schema.decodeUnknown(PhaseRow)

const phaseRowToDomain = (row: typeof PhaseRow.Type): SchedulePhase =>
  new SchedulePhase({
    id: SchedulePhaseId.make(row.id),
    scheduleId: InjectionScheduleId.make(row.schedule_id),
    order: row.order as PhaseOrder,
    durationDays: row.duration_days as PhaseDurationDays | null,
    dosage: Dosage.make(row.dosage),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  })

const scheduleRowToDomain = (row: typeof ScheduleRow.Type, phases: SchedulePhase[]): InjectionSchedule =>
  new InjectionSchedule({
    id: InjectionScheduleId.make(row.id),
    name: ScheduleName.make(row.name),
    drug: DrugName.make(row.drug),
    source: row.source ? DrugSource.make(row.source) : null,
    frequency: row.frequency as Frequency,
    startDate: new Date(row.start_date),
    isActive: row.is_active === 1,
    notes: row.notes ? Notes.make(row.notes) : null,
    phases,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  })

const generateUuid = () => crypto.randomUUID()

// ============================================
// Repository Service Definition
// ============================================

export class ScheduleRepo extends Effect.Tag('ScheduleRepo')<
  ScheduleRepo,
  {
    readonly list: (userId: string) => Effect.Effect<InjectionSchedule[], ScheduleDatabaseError>
    readonly getActive: (userId: string) => Effect.Effect<Option.Option<InjectionSchedule>, ScheduleDatabaseError>
    readonly findById: (id: string) => Effect.Effect<Option.Option<InjectionSchedule>, ScheduleDatabaseError>
    readonly create: (
      data: InjectionScheduleCreate,
      userId: string,
    ) => Effect.Effect<InjectionSchedule, ScheduleDatabaseError>
    readonly update: (
      data: InjectionScheduleUpdate,
    ) => Effect.Effect<InjectionSchedule, ScheduleNotFoundError | ScheduleDatabaseError>
    readonly delete: (id: string) => Effect.Effect<boolean, ScheduleDatabaseError>
    readonly getLastInjectionDate: (
      userId: string,
      drug: string,
    ) => Effect.Effect<Option.Option<Date>, ScheduleDatabaseError>
  }
>() {}

// ============================================
// Repository Implementation
// ============================================

export const ScheduleRepoLive = Layer.effect(
  ScheduleRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // Helper to load phases for a schedule
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
        const now = new Date().toISOString()
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

    return {
      list: (userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT id, name, drug, source, frequency, start_date, is_active, notes, created_at, updated_at
            FROM injection_schedules
            WHERE user_id = ${userId}
            ORDER BY start_date DESC
          `
          const schedules: InjectionSchedule[] = []
          for (const row of rows) {
            const decoded = yield* decodeScheduleRow(row)
            const phases = yield* loadPhases(decoded.id)
            schedules.push(scheduleRowToDomain(decoded, phases))
          }
          return schedules
        }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause }))),

      getActive: (userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT id, name, drug, source, frequency, start_date, is_active, notes, created_at, updated_at
            FROM injection_schedules
            WHERE user_id = ${userId} AND is_active = 1
            LIMIT 1
          `
          if (rows.length === 0) return Option.none()
          const decoded = yield* decodeScheduleRow(rows[0])
          const phases = yield* loadPhases(decoded.id)
          return Option.some(scheduleRowToDomain(decoded, phases))
        }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause }))),

      findById: (id) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT id, name, drug, source, frequency, start_date, is_active, notes, created_at, updated_at
            FROM injection_schedules
            WHERE id = ${id}
          `
          if (rows.length === 0) return Option.none()
          const decoded = yield* decodeScheduleRow(rows[0])
          const phases = yield* loadPhases(decoded.id)
          return Option.some(scheduleRowToDomain(decoded, phases))
        }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause }))),

      create: (data, userId) =>
        Effect.gen(function* () {
          const id = generateUuid()
          const source = Option.isSome(data.source) ? data.source.value : null
          const notes = Option.isSome(data.notes) ? data.notes.value : null
          const now = new Date().toISOString()
          const startDateStr = data.startDate.toISOString()

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
        }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'insert', cause }))),

      update: (data) =>
        Effect.gen(function* () {
          // First get current values
          const current = yield* sql`
            SELECT id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at
            FROM injection_schedules WHERE id = ${data.id}
          `.pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

          if (current.length === 0) {
            return yield* ScheduleNotFoundError.make({ id: data.id })
          }

          const curr = yield* decodeScheduleRow(current[0]).pipe(
            Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })),
          )

          const userId = (current[0] as { user_id: string }).user_id

          const newName = data.name ?? curr.name
          const newDrug = data.drug ?? curr.drug
          const newSource = Option.isSome(data.source) ? data.source.value : curr.source
          const newFrequency = data.frequency ?? curr.frequency
          const newStartDate = data.startDate ? data.startDate.toISOString() : curr.start_date
          const newIsActive = data.isActive ?? curr.is_active === 1
          const newNotes = Option.isSome(data.notes) ? data.notes.value : curr.notes
          const now = new Date().toISOString()

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
            WHERE id = ${data.id}
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
            WHERE id = ${data.id}
          `.pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })))

          const decoded = yield* decodeScheduleRow(rows[0]).pipe(
            Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })),
          )
          const phases = yield* loadPhases(data.id).pipe(
            Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause })),
          )
          return scheduleRowToDomain(decoded, phases)
        }),

      delete: (id) =>
        Effect.gen(function* () {
          const existing = yield* sql`SELECT id FROM injection_schedules WHERE id = ${id}`
          if (existing.length === 0) return false
          // Phases are deleted via CASCADE
          yield* sql`DELETE FROM injection_schedules WHERE id = ${id}`
          return true
        }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'delete', cause }))),

      getLastInjectionDate: (userId, drug) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ datetime: string }>`
            SELECT datetime FROM injection_logs 
            WHERE user_id = ${userId} AND drug = ${drug}
            ORDER BY datetime DESC
            LIMIT 1
          `
          const row = rows[0]
          if (!row) return Option.none()
          return Option.some(new Date(row.datetime))
        }).pipe(Effect.mapError((cause) => ScheduleDatabaseError.make({ operation: 'query', cause }))),
    }
  }),
)
