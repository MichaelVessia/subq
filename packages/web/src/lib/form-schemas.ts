/**
 * Form schemas for React Hook Form integration with Effect Schema.
 *
 * These schemas handle the transformation from HTML form string inputs
 * to validated domain types. They're UI-specific and live in the web package.
 */
import { Schema } from 'effect'

// ============================================
// Weight Log Form Schema
// ============================================

/**
 * Schema for weight log form inputs.
 * Validates string inputs from HTML form fields.
 */
export class WeightLogFormSchema extends Schema.Class<WeightLogFormSchema>('WeightLogFormSchema')({
  datetime: Schema.String.pipe(
    Schema.nonEmptyString({ message: () => 'Date & time is required' }),
    Schema.filter(
      (s) => {
        const date = new Date(s)
        return !Number.isNaN(date.getTime())
      },
      { message: () => 'Invalid date' },
    ),
    Schema.filter(
      (s) => {
        const date = new Date(s)
        return date <= new Date()
      },
      { message: () => 'Cannot log future weights' },
    ),
  ),
  weight: Schema.String.pipe(
    Schema.nonEmptyString({ message: () => 'Weight is required' }),
    Schema.filter(
      (s) => {
        const num = Number.parseFloat(s)
        return !Number.isNaN(num)
      },
      { message: () => 'Must be a number' },
    ),
    Schema.filter(
      (s) => {
        const num = Number.parseFloat(s)
        return num > 0
      },
      { message: () => 'Must be greater than 0' },
    ),
    Schema.filter(
      (s) => {
        const num = Number.parseFloat(s)
        return num <= 1000
      },
      { message: () => 'Please enter a realistic weight' },
    ),
  ),
  notes: Schema.String,
}) {}

export type WeightLogFormInput = typeof WeightLogFormSchema.Type

/**
 * Creates a Standard Schema V1 resolver for React Hook Form.
 * Use with: resolver: standardSchemaResolver(weightLogFormStandardSchema)
 */
export const weightLogFormStandardSchema = Schema.standardSchemaV1(WeightLogFormSchema)

// ============================================
// Inventory Form Schema
// ============================================

/**
 * Schema for inventory form inputs.
 * Validates string inputs from HTML form fields.
 */
export class InventoryFormSchema extends Schema.Class<InventoryFormSchema>('InventoryFormSchema')({
  form: Schema.Literal('vial', 'pen'),
  drug: Schema.String.pipe(Schema.nonEmptyString({ message: () => 'Medication is required' })),
  source: Schema.String.pipe(Schema.nonEmptyString({ message: () => 'Pharmacy source is required' })),
  totalAmount: Schema.String.pipe(Schema.nonEmptyString({ message: () => 'Total amount is required' })),
  status: Schema.Literal('new', 'opened', 'finished'),
  beyondUseDate: Schema.String, // Optional, empty string means no date
  quantity: Schema.String, // Only used for create, number of items to create
}) {}

export type InventoryFormInput = typeof InventoryFormSchema.Type

export const inventoryFormStandardSchema = Schema.standardSchemaV1(InventoryFormSchema)

// ============================================
// Injection Log Form Schema
// ============================================

const dosagePattern = /^\d+(\.\d+)?\s*(mg|mcg|ml|units?|iu)$/i

/**
 * Schema for injection log form inputs.
 * Validates string inputs from HTML form fields.
 */
export class InjectionLogFormSchema extends Schema.Class<InjectionLogFormSchema>('InjectionLogFormSchema')({
  datetime: Schema.String.pipe(
    Schema.nonEmptyString({ message: () => 'Date & time is required' }),
    Schema.filter(
      (s) => {
        const date = new Date(s)
        return !Number.isNaN(date.getTime())
      },
      { message: () => 'Invalid date' },
    ),
    Schema.filter(
      (s) => {
        const date = new Date(s)
        return date <= new Date()
      },
      { message: () => 'Cannot log future injections' },
    ),
  ),
  drug: Schema.String.pipe(
    Schema.nonEmptyString({ message: () => 'Medication is required' }),
    Schema.filter((s) => s.trim().length >= 2, { message: () => 'Enter a valid medication name' }),
  ),
  source: Schema.String, // Optional
  dosage: Schema.String.pipe(
    Schema.nonEmptyString({ message: () => 'Dosage is required' }),
    Schema.filter((s) => dosagePattern.test(s.trim()), {
      message: () => 'Enter dosage with unit (e.g., 2.5mg, 0.5ml)',
    }),
  ),
  injectionSite: Schema.String, // Optional
  notes: Schema.String, // Optional
  finishVial: Schema.Boolean,
  selectedInventoryId: Schema.String, // Empty string if not selected
}) {}

export type InjectionLogFormInput = typeof InjectionLogFormSchema.Type

export const injectionLogFormStandardSchema = Schema.standardSchemaV1(InjectionLogFormSchema)

// ============================================
// Goal Form Schema
// ============================================

/**
 * Schema for goal form inputs.
 * Validates string inputs from HTML form fields.
 */
export class GoalFormSchema extends Schema.Class<GoalFormSchema>('GoalFormSchema')({
  goalWeight: Schema.String.pipe(
    Schema.nonEmptyString({ message: () => 'Goal weight is required' }),
    Schema.filter(
      (s) => {
        const num = Number.parseFloat(s)
        return !Number.isNaN(num)
      },
      { message: () => 'Must be a number' },
    ),
    Schema.filter(
      (s) => {
        const num = Number.parseFloat(s)
        return num > 0
      },
      { message: () => 'Must be greater than 0' },
    ),
    Schema.filter(
      (s) => {
        const num = Number.parseFloat(s)
        return num <= 1000
      },
      { message: () => 'Please enter a realistic weight' },
    ),
  ),
  startDate: Schema.String, // Optional, empty string means no date
  targetDate: Schema.String, // Optional, empty string means no date
  notes: Schema.String, // Optional
}) {}

export type GoalFormInput = typeof GoalFormSchema.Type

export const goalFormStandardSchema = Schema.standardSchemaV1(GoalFormSchema)

// ============================================
// Schedule Form Schemas
// ============================================

/**
 * Schema for a single phase within a schedule form.
 * Validates phase inputs from HTML form fields.
 * Handles conditional validation: durationDays is optional if isIndefinite is true.
 */
export const SchedulePhaseSchema = Schema.Struct({
  order: Schema.Number.pipe(
    Schema.int({ message: () => 'Phase order must be a whole number' }),
    Schema.positive({ message: () => 'Phase order must be positive' }),
  ),
  durationDays: Schema.String, // Empty string when indefinite
  dosage: Schema.String.pipe(
    Schema.nonEmptyString({ message: () => 'Dosage is required' }),
    Schema.filter((s) => dosagePattern.test(s.trim()), {
      message: () => 'Enter dosage with unit (e.g., 2.5mg, 0.5ml)',
    }),
  ),
  isIndefinite: Schema.Boolean,
}).pipe(
  Schema.filter(
    (phase) => {
      // If indefinite, durationDays can be empty
      if (phase.isIndefinite) return true
      // Otherwise, must have valid positive integer
      const parsed = Number.parseInt(phase.durationDays, 10)
      return !Number.isNaN(parsed) && parsed > 0
    },
    { message: () => 'Duration is required for non-indefinite phases' },
  ),
)

export type SchedulePhaseFormInput = typeof SchedulePhaseSchema.Type

const frequencyLiteral = Schema.Literal('daily', 'every_3_days', 'weekly', 'every_2_weeks', 'monthly')

/**
 * Schema for schedule form inputs.
 * Validates string inputs from HTML form fields.
 */
export class ScheduleFormSchema extends Schema.Class<ScheduleFormSchema>('ScheduleFormSchema')({
  name: Schema.String.pipe(Schema.nonEmptyString({ message: () => 'Schedule name is required' })),
  drug: Schema.String.pipe(Schema.nonEmptyString({ message: () => 'Medication is required' })),
  frequency: frequencyLiteral,
  startDate: Schema.String.pipe(
    Schema.nonEmptyString({ message: () => 'Start date is required' }),
    Schema.filter(
      (s) => {
        const date = new Date(s)
        return !Number.isNaN(date.getTime())
      },
      { message: () => 'Invalid date' },
    ),
  ),
  notes: Schema.String, // Optional
  phases: Schema.NonEmptyArray(SchedulePhaseSchema).pipe(
    Schema.filter(
      (phases) => {
        // Only the last phase can be indefinite
        for (let i = 0; i < phases.length - 1; i++) {
          if (phases[i]?.isIndefinite) return false
        }
        return true
      },
      { message: () => 'Only the last phase can be indefinite' },
    ),
  ),
}) {}

export type ScheduleFormInput = typeof ScheduleFormSchema.Type

export const scheduleFormStandardSchema = Schema.standardSchemaV1(ScheduleFormSchema)
