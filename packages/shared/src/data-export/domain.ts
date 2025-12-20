import { Schema } from 'effect'
import { UserGoal } from '../goals/domain.js'
import { InjectionLog } from '../injection/domain.js'
import { Inventory } from '../inventory/domain.js'
import { InjectionSchedule } from '../schedule/domain.js'
import { WeightLog } from '../weight/domain.js'

// ============================================
// Data Export Version
// ============================================

/**
 * Schema version for data exports.
 * Increment when making breaking changes to the export format.
 */
export const DataExportVersion = Schema.Literal('1.0.0')
export type DataExportVersion = typeof DataExportVersion.Type

// ============================================
// Settings for Export (simplified, no ID)
// ============================================

/**
 * User settings as included in export.
 * Excludes ID since it's user-specific.
 */
export class ExportedSettings extends Schema.Class<ExportedSettings>('ExportedSettings')({
  weightUnit: Schema.Literal('lbs', 'kg'),
}) {}

// ============================================
// Data Export Schema
// ============================================

/**
 * Complete data export for a user.
 * Contains all user data in a portable, versioned format.
 *
 * @property version - Schema version for migration support
 * @property exportedAt - When the export was created
 * @property data - All user data organized by entity type
 */
export class DataExport extends Schema.Class<DataExport>('DataExport')({
  version: DataExportVersion,
  exportedAt: Schema.DateTimeUtc,
  data: Schema.Struct({
    weightLogs: Schema.Array(WeightLog),
    injectionLogs: Schema.Array(InjectionLog),
    inventory: Schema.Array(Inventory),
    schedules: Schema.Array(InjectionSchedule),
    goals: Schema.Array(UserGoal),
    settings: Schema.NullOr(ExportedSettings),
  }),
}) {}

// ============================================
// Import Result
// ============================================

/**
 * Summary of what was imported.
 */
export class DataImportResult extends Schema.Class<DataImportResult>('DataImportResult')({
  weightLogs: Schema.Number,
  injectionLogs: Schema.Number,
  inventory: Schema.Number,
  schedules: Schema.Number,
  goals: Schema.Number,
  settingsUpdated: Schema.Boolean,
}) {}

// ============================================
// Errors
// ============================================

export class DataExportError extends Schema.TaggedError<DataExportError>()('DataExportError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export class DataImportError extends Schema.TaggedError<DataImportError>()('DataImportError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}
