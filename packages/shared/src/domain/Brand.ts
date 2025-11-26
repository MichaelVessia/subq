import { Schema } from 'effect'

// ============================================
// Entity IDs
// ============================================

/** UUID identifier for weight log entries */
export const WeightLogId = Schema.String.pipe(Schema.brand('WeightLogId'))
export type WeightLogId = typeof WeightLogId.Type

/** UUID identifier for injection log entries */
export const InjectionLogId = Schema.String.pipe(Schema.brand('InjectionLogId'))
export type InjectionLogId = typeof InjectionLogId.Type

/** User identifier from auth system */
export const UserId = Schema.String.pipe(Schema.brand('UserId'))
export type UserId = typeof UserId.Type

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

// ============================================
// Injection Domain Primitives
// ============================================

/** Drug/compound name */
export const DrugName = Schema.String.pipe(Schema.nonEmptyString(), Schema.brand('DrugName'))
export type DrugName = typeof DrugName.Type

/** Dosage string (e.g., "200mg", "0.5ml") */
export const Dosage = Schema.String.pipe(Schema.nonEmptyString(), Schema.brand('Dosage'))
export type Dosage = typeof Dosage.Type

/** Numeric dosage value extracted from dosage string */
export const DosageValue = Schema.Number.pipe(Schema.brand('DosageValue'))
export type DosageValue = typeof DosageValue.Type

/** Injection site location */
export const InjectionSite = Schema.String.pipe(Schema.nonEmptyString(), Schema.brand('InjectionSite'))
export type InjectionSite = typeof InjectionSite.Type

/** Drug/pharmacy source */
export const DrugSource = Schema.String.pipe(Schema.nonEmptyString(), Schema.brand('DrugSource'))
export type DrugSource = typeof DrugSource.Type

// ============================================
// Count/Stats Primitives
// ============================================

/** Non-negative count */
export const Count = Schema.Number.pipe(Schema.int(), Schema.nonNegative(), Schema.brand('Count'))
export type Count = typeof Count.Type

/** Days between events (non-negative) */
export const DaysBetween = Schema.Number.pipe(Schema.nonNegative(), Schema.brand('DaysBetween'))
export type DaysBetween = typeof DaysBetween.Type

/** Injections per week rate */
export const InjectionsPerWeek = Schema.Number.pipe(Schema.nonNegative(), Schema.brand('InjectionsPerWeek'))
export type InjectionsPerWeek = typeof InjectionsPerWeek.Type

/** Day of week (0=Sunday, 6=Saturday) */
export const DayOfWeek = Schema.Number.pipe(Schema.int(), Schema.between(0, 6), Schema.brand('DayOfWeek'))
export type DayOfWeek = typeof DayOfWeek.Type

// ============================================
// Pagination Primitives
// ============================================

/** Limit for pagination (positive integer) */
export const Limit = Schema.Number.pipe(Schema.int(), Schema.positive(), Schema.brand('Limit'))
export type Limit = typeof Limit.Type

/** Offset for pagination (non-negative integer) */
export const Offset = Schema.Number.pipe(Schema.int(), Schema.nonNegative(), Schema.brand('Offset'))
export type Offset = typeof Offset.Type

// ============================================
// Notes/Text
// ============================================

/** Free-text notes */
export const Notes = Schema.String.pipe(Schema.brand('Notes'))
export type Notes = typeof Notes.Type
