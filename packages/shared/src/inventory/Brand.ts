import { Schema } from 'effect'

// ============================================
// Inventory Domain Entity ID
// ============================================

/** UUID identifier for inventory entries */
export const InventoryId = Schema.String.pipe(Schema.brand('InventoryId'))
export type InventoryId = typeof InventoryId.Type

// ============================================
// Inventory Domain Primitives
// ============================================

/** Form of the medication - vial (compounded) or pen (branded) */
export const InventoryForm = Schema.Literal('vial', 'pen')
export type InventoryForm = typeof InventoryForm.Type

/** Status of the inventory item */
export const InventoryStatus = Schema.Literal('new', 'opened', 'finished')
export type InventoryStatus = typeof InventoryStatus.Type

/** Total amount in the vial/pen (e.g., "10mg", "2.4mg") */
export const TotalAmount = Schema.String.pipe(Schema.nonEmptyString(), Schema.brand('TotalAmount'))
export type TotalAmount = typeof TotalAmount.Type
