import { Schema } from 'effect'
import { Notes, Weight, WeightLogId } from '@subq/shared'

/**
 * CLI boundary validators using Schema.decodeUnknown for branded types.
 * Use these to properly validate and type CLI inputs before passing to domain code.
 */

/** Validate and brand a weight value from CLI input */
export const validateWeight = Schema.decodeUnknown(Weight)

/** Validate and brand notes from CLI input */
export const validateNotes = Schema.decodeUnknown(Notes)

/** Validate and brand a weight log ID from CLI input */
export const validateWeightLogId = Schema.decodeUnknown(WeightLogId)
