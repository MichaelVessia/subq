import { Schema } from 'effect'

// ============================================
// Weight Domain Errors
// ============================================

export class WeightLogNotFoundError extends Schema.TaggedError<WeightLogNotFoundError>()('WeightLogNotFoundError', {
  id: Schema.String,
}) {}

export class WeightLogDatabaseError extends Schema.TaggedError<WeightLogDatabaseError>()('WeightLogDatabaseError', {
  operation: Schema.Literal('insert', 'update', 'delete', 'query'),
  cause: Schema.Defect,
}) {}

// ============================================
// Injection Domain Errors
// ============================================

export class InjectionLogNotFoundError extends Schema.TaggedError<InjectionLogNotFoundError>()(
  'InjectionLogNotFoundError',
  {
    id: Schema.String,
  },
) {}

export class InjectionLogDatabaseError extends Schema.TaggedError<InjectionLogDatabaseError>()(
  'InjectionLogDatabaseError',
  {
    operation: Schema.Literal('insert', 'update', 'delete', 'query'),
    cause: Schema.Defect,
  },
) {}

// ============================================
// Inventory Domain Errors
// ============================================

export class InventoryNotFoundError extends Schema.TaggedError<InventoryNotFoundError>()('InventoryNotFoundError', {
  id: Schema.String,
}) {}

export class InventoryDatabaseError extends Schema.TaggedError<InventoryDatabaseError>()('InventoryDatabaseError', {
  operation: Schema.Literal('insert', 'update', 'delete', 'query'),
  cause: Schema.Defect,
}) {}

// ============================================
// Stats Domain Errors
// ============================================

export class StatsDatabaseError extends Schema.TaggedError<StatsDatabaseError>()('StatsDatabaseError', {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

// ============================================
// Union Types for Convenience
// ============================================

export const WeightLogError = Schema.Union(WeightLogNotFoundError, WeightLogDatabaseError)
export type WeightLogError = typeof WeightLogError.Type

export const InjectionLogError = Schema.Union(InjectionLogNotFoundError, InjectionLogDatabaseError)
export type InjectionLogError = typeof InjectionLogError.Type

export const InventoryError = Schema.Union(InventoryNotFoundError, InventoryDatabaseError)
export type InventoryError = typeof InventoryError.Type
