/**
 * Form schemas for React Hook Form integration with Effect Schema.
 *
 * These schemas handle the transformation from HTML form string inputs
 * to validated domain types. They're UI-specific and live in the web package.
 */
import { Schema } from 'effect'

const nonEmpty = (message: string) => Schema.isNonEmpty({ message })
const fieldFilter = <A>(predicate: (value: A) => boolean, message: string) =>
  Schema.makeFilter<A>((value) => predicate(value), { message })

// ============================================
// Weight Log Form Schema
// ============================================

/**
 * Schema for weight log form inputs.
 * Validates string inputs from HTML form fields.
 */
class WeightLogFormSchema extends Schema.Class<WeightLogFormSchema>('WeightLogFormSchema')({
  datetime: Schema.String.check(
    nonEmpty('Date & time is required'),
    fieldFilter((s: string) => {
      const date = new Date(s)
      return !Number.isNaN(date.getTime())
    }, 'Invalid date'),
    fieldFilter((s: string) => {
      const date = new Date(s)
      return date <= new Date()
    }, 'Cannot log future weights'),
  ),
  weight: Schema.String.check(
    nonEmpty('Weight is required'),
    fieldFilter((s: string) => {
      const num = Number.parseFloat(s)
      return !Number.isNaN(num)
    }, 'Must be a number'),
    fieldFilter((s: string) => {
      const num = Number.parseFloat(s)
      return num > 0
    }, 'Must be greater than 0'),
    fieldFilter((s: string) => {
      const num = Number.parseFloat(s)
      return num <= 1000
    }, 'Please enter a realistic weight'),
  ),
  notes: Schema.String,
}) {}

export type WeightLogFormInput = typeof WeightLogFormSchema.Type

/**
 * Creates a Standard Schema V1 resolver for React Hook Form.
 * Use with: resolver: standardSchemaResolver(weightLogFormStandardSchema)
 */
export const weightLogFormStandardSchema = Schema.toStandardSchemaV1(WeightLogFormSchema)

// ============================================
// Injection Log Form Schema
// ============================================

const dosagePattern = /^\d+(\.\d+)?\s*(mg|mcg|ml|units?|iu)$/i

/**
 * Schema for injection log form inputs.
 * Validates string inputs from HTML form fields.
 */
class InjectionLogFormSchema extends Schema.Class<InjectionLogFormSchema>('InjectionLogFormSchema')({
  datetime: Schema.String.check(
    nonEmpty('Date & time is required'),
    fieldFilter((s: string) => {
      const date = new Date(s)
      return !Number.isNaN(date.getTime())
    }, 'Invalid date'),
    fieldFilter((s: string) => {
      const date = new Date(s)
      return date <= new Date()
    }, 'Cannot log future injections'),
  ),
  drug: Schema.String.check(
    nonEmpty('Medication is required'),
    fieldFilter((s: string) => s.trim().length >= 2, 'Enter a valid medication name'),
  ),
  source: Schema.String, // Optional
  dosage: Schema.String.check(
    nonEmpty('Dosage is required'),
    fieldFilter((s: string) => dosagePattern.test(s.trim()), 'Enter dosage with unit (e.g., 2.5mg, 0.5ml)'),
  ),
  injectionSite: Schema.String, // Optional
  notes: Schema.String, // Optional
}) {}

export type InjectionLogFormInput = typeof InjectionLogFormSchema.Type

export const injectionLogFormStandardSchema = Schema.toStandardSchemaV1(InjectionLogFormSchema)

// ============================================
// Goal Form Schema
// ============================================

/**
 * Schema for goal form inputs.
 * Validates string inputs from HTML form fields.
 */
export class GoalFormSchema extends Schema.Class<GoalFormSchema>('GoalFormSchema')({
  goalWeight: Schema.String.check(
    nonEmpty('Goal weight is required'),
    fieldFilter((s: string) => {
      const num = Number.parseFloat(s)
      return !Number.isNaN(num)
    }, 'Must be a number'),
    fieldFilter((s: string) => {
      const num = Number.parseFloat(s)
      return num > 0
    }, 'Must be greater than 0'),
    fieldFilter((s: string) => {
      const num = Number.parseFloat(s)
      return num <= 1000
    }, 'Please enter a realistic weight'),
  ),
  startDate: Schema.String, // Optional, empty string means no date
  targetDate: Schema.String, // Optional, empty string means no date
  notes: Schema.String, // Optional
}) {}

export type GoalFormInput = typeof GoalFormSchema.Type

export const goalFormStandardSchema = Schema.toStandardSchemaV1(GoalFormSchema)

// ============================================
// Schedule Form Schemas
// ============================================

/**
 * Schema for a single phase within a schedule form.
 * Validates phase inputs from HTML form fields.
 * Handles conditional validation: durationDays is optional if isIndefinite is true.
 */
export const SchedulePhaseSchema = Schema.Struct({
  order: Schema.Int.check(Schema.isGreaterThan(0, { message: 'Phase order must be positive' })),
  durationDays: Schema.String, // Empty string when indefinite
  dosage: Schema.String.check(
    nonEmpty('Dosage is required'),
    fieldFilter((s: string) => dosagePattern.test(s.trim()), 'Enter dosage with unit (e.g., 2.5mg, 0.5ml)'),
  ),
  isIndefinite: Schema.Boolean,
}).check(
  Schema.makeFilter(
    (phase) => {
      // If indefinite, durationDays can be empty
      if (phase.isIndefinite) return true
      // Otherwise, must have valid positive integer
      const parsed = Number.parseInt(phase.durationDays, 10)
      return !Number.isNaN(parsed) && parsed > 0
    },
    { message: 'Duration is required for non-indefinite phases' },
  ),
)

const frequencyLiteral = Schema.Literals(['daily', 'every_3_days', 'weekly', 'every_2_weeks', 'monthly'] as const)

/**
 * Schema for schedule form inputs.
 * Validates string inputs from HTML form fields.
 */
export class ScheduleFormSchema extends Schema.Class<ScheduleFormSchema>('ScheduleFormSchema')({
  name: Schema.String.check(nonEmpty('Schedule name is required')),
  drug: Schema.String.check(nonEmpty('Medication is required')),
  frequency: frequencyLiteral,
  startDate: Schema.String.check(
    nonEmpty('Start date is required'),
    fieldFilter((s: string) => {
      const date = new Date(s)
      return !Number.isNaN(date.getTime())
    }, 'Invalid date'),
  ),
  notes: Schema.String, // Optional
  phases: Schema.NonEmptyArray(SchedulePhaseSchema).check(
    Schema.makeFilter(
      (phases) => {
        // Only the last phase can be indefinite
        for (let i = 0; i < phases.length - 1; i++) {
          if (phases[i]?.isIndefinite) return false
        }
        return true
      },
      { message: 'Only the last phase can be indefinite' },
    ),
  ),
}) {}

export type ScheduleFormInput = typeof ScheduleFormSchema.Type

export const scheduleFormStandardSchema = Schema.toStandardSchemaV1(ScheduleFormSchema)

// ============================================
// Change Password Form Schema
// ============================================

const MIN_PASSWORD_LENGTH = 8

/**
 * Schema for change password form inputs.
 * Validates password fields and ensures confirmPassword matches newPassword.
 */
export const ChangePasswordFormSchema = Schema.Struct({
  currentPassword: Schema.String.check(nonEmpty('Current password is required')),
  newPassword: Schema.String.check(
    nonEmpty('New password is required'),
    fieldFilter(
      (s: string) => s.length >= MIN_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    ),
  ),
  confirmPassword: Schema.String.check(nonEmpty('Please confirm your password')),
}).check(Schema.makeFilter((form) => form.confirmPassword === form.newPassword, { message: 'Passwords do not match' }))

export type ChangePasswordFormInput = typeof ChangePasswordFormSchema.Type

export const changePasswordFormStandardSchema = Schema.toStandardSchemaV1(ChangePasswordFormSchema)
