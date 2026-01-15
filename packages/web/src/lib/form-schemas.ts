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
