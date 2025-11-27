import { Schema } from 'effect'

// ============================================
// Schedule Domain Entity IDs
// ============================================

/** UUID identifier for injection schedules */
export const InjectionScheduleId = Schema.String.pipe(Schema.brand('InjectionScheduleId'))
export type InjectionScheduleId = typeof InjectionScheduleId.Type

/** UUID identifier for schedule phases */
export const SchedulePhaseId = Schema.String.pipe(Schema.brand('SchedulePhaseId'))
export type SchedulePhaseId = typeof SchedulePhaseId.Type

// ============================================
// Schedule Domain Primitives
// ============================================

/** Schedule name/label */
export const ScheduleName = Schema.String.pipe(Schema.nonEmptyString(), Schema.brand('ScheduleName'))
export type ScheduleName = typeof ScheduleName.Type

/** Frequency of injections (e.g., "weekly", "every 3 days") */
export const Frequency = Schema.Literal('daily', 'every_3_days', 'weekly', 'every_2_weeks', 'monthly')
export type Frequency = typeof Frequency.Type

/** Phase order number (1-based) */
export const PhaseOrder = Schema.Number.pipe(Schema.int(), Schema.positive(), Schema.brand('PhaseOrder'))
export type PhaseOrder = typeof PhaseOrder.Type

/** Duration in days for a phase */
export const PhaseDurationDays = Schema.Number.pipe(Schema.int(), Schema.positive(), Schema.brand('PhaseDurationDays'))
export type PhaseDurationDays = typeof PhaseDurationDays.Type
