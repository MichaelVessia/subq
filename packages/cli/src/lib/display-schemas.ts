import type { WeightLog } from '@subq/shared'
import pc from 'picocolors'
import { type DisplaySchema, formatters } from './output.js'

/**
 * Display schema for WeightLog entries.
 * Used for both list and single-item display.
 */
export const WeightLogDisplay: DisplaySchema<WeightLog> = {
  columns: [
    {
      key: 'datetime',
      label: 'Date',
      width: 12,
      format: formatters.date,
      color: () => pc.dim,
    },
    {
      key: 'weight',
      label: 'Weight',
      width: 12,
      format: formatters.weight,
      color: () => pc.bold,
    },
    {
      key: 'notes',
      label: 'Notes',
      width: 30,
      format: formatters.truncate(30),
      color: (v) => (v ? pc.italic : pc.dim),
    },
  ],
}
