import { Schema } from 'effect'

// ============================================
// Injection Domain Entity ID
// ============================================

/** UUID identifier for injection log entries */
export const InjectionLogId = Schema.String.pipe(Schema.brand('InjectionLogId'))
export type InjectionLogId = typeof InjectionLogId.Type

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

/** Injections per week rate */
export const InjectionsPerWeek = Schema.Number.pipe(Schema.nonNegative(), Schema.brand('InjectionsPerWeek'))
export type InjectionsPerWeek = typeof InjectionsPerWeek.Type
