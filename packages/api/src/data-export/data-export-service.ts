import { SqlClient } from '@effect/sql'
import {
  DataExport,
  DataExportError,
  DataImportError,
  DataImportResult,
  Dosage,
  DrugName,
  DrugSource,
  ExportedSettings,
  type Frequency,
  GoalId,
  InjectionLog,
  InjectionLogId,
  InjectionSchedule,
  InjectionScheduleId,
  InjectionSite,
  Inventory,
  InventoryId,
  Notes,
  type PhaseDurationDays,
  type PhaseOrder,
  ScheduleName,
  SchedulePhase,
  SchedulePhaseId,
  TotalAmount,
  UserGoal,
  Weight,
  WeightLog,
  WeightLogId,
} from '@subq/shared'
import { DateTime, Effect, Layer, Schema } from 'effect'

// ============================================
// Service Definition
// ============================================

export class DataExportService extends Effect.Tag('DataExportService')<
  DataExportService,
  {
    readonly exportData: (userId: string) => Effect.Effect<DataExport, DataExportError>
    readonly importData: (userId: string, data: DataExport) => Effect.Effect<DataImportResult, DataImportError>
  }
>() {}

// ============================================
// Row Schemas for Direct SQL Queries
// ============================================

const WeightLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.String,
  weight: Schema.Number,
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const InjectionLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.String,
  drug: Schema.String,
  source: Schema.NullOr(Schema.String),
  dosage: Schema.String,
  injection_site: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  schedule_id: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const InventoryRow = Schema.Struct({
  id: Schema.String,
  drug: Schema.String,
  source: Schema.String,
  form: Schema.Literal('vial', 'pen'),
  total_amount: Schema.String,
  status: Schema.Literal('new', 'opened', 'finished'),
  beyond_use_date: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const ScheduleRow = Schema.Struct({
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

const GoalRow = Schema.Struct({
  id: Schema.String,
  goal_weight: Schema.Number,
  starting_weight: Schema.Number,
  starting_date: Schema.String,
  target_date: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  is_active: Schema.Number,
  completed_at: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const SettingsRow = Schema.Struct({
  weight_unit: Schema.Literal('lbs', 'kg'),
})

// ============================================
// Implementation
// ============================================

export const DataExportServiceLive = Layer.effect(
  DataExportService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const exportData = (userId: string) =>
      Effect.gen(function* () {
        // Fetch all weight logs
        const weightLogRows = yield* sql`
          SELECT id, datetime, weight, notes, created_at, updated_at
          FROM weight_logs WHERE user_id = ${userId}
          ORDER BY datetime DESC
        `
        const weightLogs = yield* Effect.all(
          weightLogRows.map((row) =>
            Schema.decodeUnknown(WeightLogRow)(row).pipe(
              Effect.map(
                (r) =>
                  new WeightLog({
                    id: WeightLogId.make(r.id),
                    datetime: DateTime.unsafeMake(r.datetime),
                    weight: Weight.make(r.weight),
                    notes: r.notes ? Notes.make(r.notes) : null,
                    createdAt: DateTime.unsafeMake(r.created_at),
                    updatedAt: DateTime.unsafeMake(r.updated_at),
                  }),
              ),
            ),
          ),
        )

        // Fetch all injection logs
        const injectionLogRows = yield* sql`
          SELECT id, datetime, drug, source, dosage, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs WHERE user_id = ${userId}
          ORDER BY datetime DESC
        `
        const injectionLogs = yield* Effect.all(
          injectionLogRows.map((row) =>
            Schema.decodeUnknown(InjectionLogRow)(row).pipe(
              Effect.map(
                (r) =>
                  new InjectionLog({
                    id: InjectionLogId.make(r.id),
                    datetime: DateTime.unsafeMake(r.datetime),
                    drug: DrugName.make(r.drug),
                    source: r.source ? DrugSource.make(r.source) : null,
                    dosage: Dosage.make(r.dosage),
                    injectionSite: r.injection_site ? InjectionSite.make(r.injection_site) : null,
                    notes: r.notes ? Notes.make(r.notes) : null,
                    scheduleId: r.schedule_id ? InjectionScheduleId.make(r.schedule_id) : null,
                    createdAt: DateTime.unsafeMake(r.created_at),
                    updatedAt: DateTime.unsafeMake(r.updated_at),
                  }),
              ),
            ),
          ),
        )

        // Fetch all inventory
        const inventoryRows = yield* sql`
          SELECT id, drug, source, form, total_amount, status, beyond_use_date, created_at, updated_at
          FROM glp1_inventory WHERE user_id = ${userId}
          ORDER BY created_at DESC
        `
        const inventory = yield* Effect.all(
          inventoryRows.map((row) =>
            Schema.decodeUnknown(InventoryRow)(row).pipe(
              Effect.map(
                (r) =>
                  new Inventory({
                    id: InventoryId.make(r.id),
                    drug: DrugName.make(r.drug),
                    source: DrugSource.make(r.source),
                    form: r.form,
                    totalAmount: TotalAmount.make(r.total_amount),
                    status: r.status,
                    beyondUseDate: r.beyond_use_date ? DateTime.unsafeMake(r.beyond_use_date) : null,
                    createdAt: DateTime.unsafeMake(r.created_at),
                    updatedAt: DateTime.unsafeMake(r.updated_at),
                  }),
              ),
            ),
          ),
        )

        // Fetch all schedules with phases
        const scheduleRows = yield* sql`
          SELECT id, name, drug, source, frequency, start_date, is_active, notes, created_at, updated_at
          FROM injection_schedules WHERE user_id = ${userId}
          ORDER BY start_date DESC
        `
        const schedules = yield* Effect.all(
          scheduleRows.map((row) =>
            Effect.gen(function* () {
              const r = yield* Schema.decodeUnknown(ScheduleRow)(row)

              // Fetch phases for this schedule
              const phaseRows = yield* sql`
                SELECT id, schedule_id, "order", duration_days, dosage, created_at, updated_at
                FROM schedule_phases WHERE schedule_id = ${r.id}
                ORDER BY "order" ASC
              `
              const phases = yield* Effect.all(
                phaseRows.map((pr) =>
                  Schema.decodeUnknown(PhaseRow)(pr).pipe(
                    Effect.map(
                      (p) =>
                        new SchedulePhase({
                          id: SchedulePhaseId.make(p.id),
                          scheduleId: InjectionScheduleId.make(p.schedule_id),
                          order: p.order as PhaseOrder,
                          durationDays: p.duration_days as PhaseDurationDays | null,
                          dosage: Dosage.make(p.dosage),
                          createdAt: DateTime.unsafeMake(p.created_at),
                          updatedAt: DateTime.unsafeMake(p.updated_at),
                        }),
                    ),
                  ),
                ),
              )

              return new InjectionSchedule({
                id: InjectionScheduleId.make(r.id),
                name: ScheduleName.make(r.name),
                drug: DrugName.make(r.drug),
                source: r.source ? DrugSource.make(r.source) : null,
                frequency: r.frequency as Frequency,
                startDate: DateTime.unsafeMake(r.start_date),
                isActive: r.is_active === 1,
                notes: r.notes ? Notes.make(r.notes) : null,
                phases,
                createdAt: DateTime.unsafeMake(r.created_at),
                updatedAt: DateTime.unsafeMake(r.updated_at),
              })
            }),
          ),
        )

        // Fetch all goals
        const goalRows = yield* sql`
          SELECT id, goal_weight, starting_weight, starting_date, target_date, notes, is_active, completed_at, created_at, updated_at
          FROM user_goals WHERE user_id = ${userId}
          ORDER BY created_at DESC
        `
        const goals = yield* Effect.all(
          goalRows.map((row) =>
            Schema.decodeUnknown(GoalRow)(row).pipe(
              Effect.map(
                (r) =>
                  new UserGoal({
                    id: GoalId.make(r.id),
                    goalWeight: Weight.make(r.goal_weight),
                    startingWeight: Weight.make(r.starting_weight),
                    startingDate: DateTime.unsafeMake(r.starting_date),
                    targetDate: r.target_date ? DateTime.unsafeMake(r.target_date) : null,
                    notes: r.notes ? Notes.make(r.notes) : null,
                    isActive: r.is_active === 1,
                    completedAt: r.completed_at ? DateTime.unsafeMake(r.completed_at) : null,
                    createdAt: DateTime.unsafeMake(r.created_at),
                    updatedAt: DateTime.unsafeMake(r.updated_at),
                  }),
              ),
            ),
          ),
        )

        // Fetch settings
        const settingsRows = yield* sql`
          SELECT weight_unit FROM user_settings WHERE user_id = ${userId}
        `
        const settings =
          settingsRows.length > 0
            ? yield* Schema.decodeUnknown(SettingsRow)(settingsRows[0]).pipe(
                Effect.map((r) => new ExportedSettings({ weightUnit: r.weight_unit })),
              )
            : null

        return new DataExport({
          version: '1.0.0',
          exportedAt: DateTime.unsafeNow(),
          data: {
            weightLogs,
            injectionLogs,
            inventory,
            schedules,
            goals,
            settings,
          },
        })
      }).pipe(Effect.mapError((cause) => DataExportError.make({ message: 'Failed to export data', cause })))

    const importData = (userId: string, data: DataExport) =>
      Effect.gen(function* () {
        // Delete all existing user data (in order to handle foreign key constraints)
        yield* sql`DELETE FROM weight_logs WHERE user_id = ${userId}`
        yield* sql`DELETE FROM injection_logs WHERE user_id = ${userId}`
        yield* sql`DELETE FROM glp1_inventory WHERE user_id = ${userId}`
        yield* sql`DELETE FROM schedule_phases WHERE schedule_id IN (SELECT id FROM injection_schedules WHERE user_id = ${userId})`
        yield* sql`DELETE FROM injection_schedules WHERE user_id = ${userId}`
        yield* sql`DELETE FROM user_goals WHERE user_id = ${userId}`
        yield* sql`DELETE FROM user_settings WHERE user_id = ${userId}`

        // Import weight logs
        for (const log of data.data.weightLogs) {
          const notes = log.notes
          yield* sql`
            INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
            VALUES (${log.id}, ${DateTime.formatIso(log.datetime)}, ${log.weight}, ${notes}, ${userId}, ${DateTime.formatIso(log.createdAt)}, ${DateTime.formatIso(log.updatedAt)})
          `
        }

        // Import schedules first (so injection logs can reference them)
        for (const schedule of data.data.schedules) {
          const source = schedule.source
          const notes = schedule.notes
          yield* sql`
            INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)
            VALUES (${schedule.id}, ${schedule.name}, ${schedule.drug}, ${source}, ${schedule.frequency}, ${DateTime.formatIso(schedule.startDate)}, ${schedule.isActive ? 1 : 0}, ${notes}, ${userId}, ${DateTime.formatIso(schedule.createdAt)}, ${DateTime.formatIso(schedule.updatedAt)})
          `

          // Import phases for this schedule
          for (const phase of schedule.phases) {
            yield* sql`
              INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)
              VALUES (${phase.id}, ${phase.scheduleId}, ${phase.order}, ${phase.durationDays}, ${phase.dosage}, ${DateTime.formatIso(phase.createdAt)}, ${DateTime.formatIso(phase.updatedAt)})
            `
          }
        }

        // Import injection logs
        for (const log of data.data.injectionLogs) {
          const source = log.source
          const injectionSite = log.injectionSite
          const notes = log.notes
          const scheduleId = log.scheduleId
          yield* sql`
            INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)
            VALUES (${log.id}, ${DateTime.formatIso(log.datetime)}, ${log.drug}, ${source}, ${log.dosage}, ${injectionSite}, ${notes}, ${scheduleId}, ${userId}, ${DateTime.formatIso(log.createdAt)}, ${DateTime.formatIso(log.updatedAt)})
          `
        }

        // Import inventory
        for (const item of data.data.inventory) {
          const beyondUseDate = item.beyondUseDate ? DateTime.formatIso(item.beyondUseDate).split('T')[0] : null
          yield* sql`
            INSERT INTO glp1_inventory (id, drug, source, form, total_amount, status, beyond_use_date, user_id, created_at, updated_at)
            VALUES (${item.id}, ${item.drug}, ${item.source}, ${item.form}, ${item.totalAmount}, ${item.status}, ${beyondUseDate}, ${userId}, ${DateTime.formatIso(item.createdAt)}, ${DateTime.formatIso(item.updatedAt)})
          `
        }

        // Import goals
        for (const goal of data.data.goals) {
          const targetDate = goal.targetDate ? DateTime.formatIso(goal.targetDate) : null
          const notes = goal.notes
          const completedAt = goal.completedAt ? DateTime.formatIso(goal.completedAt) : null
          yield* sql`
            INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, notes, is_active, completed_at, created_at, updated_at)
            VALUES (${goal.id}, ${userId}, ${goal.goalWeight}, ${goal.startingWeight}, ${DateTime.formatIso(goal.startingDate).split('T')[0]}, ${targetDate}, ${notes}, ${goal.isActive ? 1 : 0}, ${completedAt}, ${DateTime.formatIso(goal.createdAt)}, ${DateTime.formatIso(goal.updatedAt)})
          `
        }

        // Import settings
        let settingsUpdated = false
        if (data.data.settings) {
          const id = crypto.randomUUID()
          const now = new Date().toISOString()
          yield* sql`
            INSERT INTO user_settings (id, user_id, weight_unit, created_at, updated_at)
            VALUES (${id}, ${userId}, ${data.data.settings.weightUnit}, ${now}, ${now})
          `
          settingsUpdated = true
        }

        return new DataImportResult({
          weightLogs: data.data.weightLogs.length,
          injectionLogs: data.data.injectionLogs.length,
          inventory: data.data.inventory.length,
          schedules: data.data.schedules.length,
          goals: data.data.goals.length,
          settingsUpdated,
        })
      }).pipe(Effect.mapError((cause) => DataImportError.make({ message: 'Failed to import data', cause })))

    return { exportData, importData }
  }),
)
