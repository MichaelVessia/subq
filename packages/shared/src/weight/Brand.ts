import { Schema } from 'effect'

// ============================================
// Weight Domain Entity ID
// ============================================

/** UUID identifier for weight log entries */
export const WeightLogId = Schema.String.pipe(Schema.brand('WeightLogId'))
export type WeightLogId = typeof WeightLogId.Type

// ============================================
// Weight Domain Primitives
// ============================================

/** Weight measurement value (positive number) */
export const Weight = Schema.Number.pipe(Schema.positive(), Schema.brand('Weight'))
export type Weight = typeof Weight.Type

/** Percentage value */
export const Percentage = Schema.Number.pipe(Schema.brand('Percentage'))
export type Percentage = typeof Percentage.Type

/** Weekly average change value */
export const WeeklyChange = Schema.Number.pipe(Schema.brand('WeeklyChange'))
export type WeeklyChange = typeof WeeklyChange.Type

/** Rate of change in lbs per week */
export const WeightRateOfChange = Schema.Number.pipe(Schema.brand('WeightRateOfChange'))
export type WeightRateOfChange = typeof WeightRateOfChange.Type
