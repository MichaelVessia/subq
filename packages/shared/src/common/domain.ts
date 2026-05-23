import { Schema } from 'effect'

// ============================================
// Common Primitives shared across domains
// ============================================

/** User identifier from auth system */
export const UserId = Schema.String.pipe(Schema.brand('UserId'))
export type UserId = typeof UserId.Type

// ============================================
// Pagination Primitives
// ============================================

/** Limit for pagination (positive integer) */
export const Limit = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand('Limit'))
export type Limit = typeof Limit.Type

/** Offset for pagination (non-negative integer) */
export const Offset = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand('Offset'))
export type Offset = typeof Offset.Type

// ============================================
// Notes/Text
// ============================================

/** Free-text notes */
export const Notes = Schema.String.pipe(Schema.brand('Notes'))
export type Notes = typeof Notes.Type

// ============================================
// Count/Stats Primitives
// ============================================

/** Non-negative count */
export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand('Count'))
export type Count = typeof Count.Type

/** Days between events (non-negative) */
export const DaysBetween = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand('DaysBetween'))
export type DaysBetween = typeof DaysBetween.Type

/** Day of week (0=Sunday, 6=Saturday) */
export const DayOfWeek = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })).pipe(Schema.brand('DayOfWeek'))
export type DayOfWeek = typeof DayOfWeek.Type

// ============================================
// Drug Primitives
// ============================================

/** Drug/compound name */
export const DrugName = Schema.NonEmptyString.pipe(Schema.brand('DrugName'))
export type DrugName = typeof DrugName.Type

/** Drug source/manufacturer */
export const DrugSource = Schema.NonEmptyString.pipe(Schema.brand('DrugSource'))
export type DrugSource = typeof DrugSource.Type

// ============================================
// Dosage Primitives
// ============================================

/** Dosage amount as string (e.g., "0.5ml", "100mg") */
export const Dosage = Schema.NonEmptyString.pipe(Schema.brand('Dosage'))
export type Dosage = typeof Dosage.Type

/** Numeric dosage value for calculations */
export const DosageValue = Schema.Number.pipe(Schema.brand('DosageValue'))
export type DosageValue = typeof DosageValue.Type
