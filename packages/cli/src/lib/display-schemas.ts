import type { InjectionLog, Inventory, WeightLog } from '@subq/shared'
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

/**
 * Display schema for InjectionLog entries.
 */
export const InjectionLogDisplay: DisplaySchema<InjectionLog> = {
  columns: [
    {
      key: 'datetime',
      label: 'Date',
      width: 12,
      format: formatters.date,
      color: () => pc.dim,
    },
    {
      key: 'drug',
      label: 'Drug',
      width: 20,
      format: formatters.truncate(20),
      color: () => pc.bold,
    },
    {
      key: 'dosage',
      label: 'Dosage',
      width: 12,
      format: formatters.string,
      color: () => pc.cyan,
    },
    {
      key: 'injectionSite',
      label: 'Site',
      width: 18,
      format: formatters.truncate(18),
      color: (v) => (v ? pc.white : pc.dim),
    },
    {
      key: 'notes',
      label: 'Notes',
      width: 20,
      format: formatters.truncate(20),
      color: (v) => (v ? pc.italic : pc.dim),
    },
  ],
}

/**
 * Display schema for Inventory entries.
 */
export const InventoryDisplay: DisplaySchema<Inventory> = {
  columns: [
    {
      key: 'drug',
      label: 'Drug',
      width: 20,
      format: formatters.truncate(20),
      color: () => pc.bold,
    },
    {
      key: 'source',
      label: 'Source',
      width: 18,
      format: formatters.truncate(18),
      color: () => pc.white,
    },
    {
      key: 'form',
      label: 'Form',
      width: 6,
      format: formatters.string,
      color: () => pc.dim,
    },
    {
      key: 'totalAmount',
      label: 'Amount',
      width: 10,
      format: formatters.string,
      color: () => pc.cyan,
    },
    {
      key: 'status',
      label: 'Status',
      width: 10,
      format: formatters.string,
      color: (v) => {
        if (v === 'new') return pc.green
        if (v === 'opened') return pc.yellow
        return pc.dim
      },
    },
    {
      key: 'beyondUseDate',
      label: 'BUD',
      width: 12,
      format: formatters.date,
      color: () => pc.dim,
    },
  ],
}
