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

// ============================================
// Count/Stats Primitives
// ============================================

/** Non-negative count */
export const Count = Schema.Number.pipe(Schema.int(), Schema.nonNegative(), Schema.brand('Count'))
export type Count = typeof Count.Type

/** Days between events (non-negative) */
export const DaysBetween = Schema.Number.pipe(Schema.nonNegative(), Schema.brand('DaysBetween'))
export type DaysBetween = typeof DaysBetween.Type

/** Day of week (0=Sunday, 6=Saturday) */
export const DayOfWeek = Schema.Number.pipe(Schema.int(), Schema.between(0, 6), Schema.brand('DayOfWeek'))
export type DayOfWeek = typeof DayOfWeek.Type

// ============================================
// Drug Primitives
// ============================================

/** Drug/compound name */
export const DrugName = Schema.String.pipe(Schema.nonEmptyString(), Schema.brand('DrugName'))
export type DrugName = typeof DrugName.Type

/** Drug source/manufacturer */
export const DrugSource = Schema.String.pipe(Schema.nonEmptyString(), Schema.brand('DrugSource'))
export type DrugSource = typeof DrugSource.Type

// ============================================
// Dosage Primitives
// ============================================

/** Dosage amount as string (e.g., "0.5ml", "100mg") */
export const Dosage = Schema.String.pipe(Schema.nonEmptyString(), Schema.brand('Dosage'))
export type Dosage = typeof Dosage.Type

/** Numeric dosage value for calculations */
export const DosageValue = Schema.Number.pipe(Schema.brand('DosageValue'))
export type DosageValue = typeof DosageValue.Type
