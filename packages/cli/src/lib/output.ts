import { Console, DateTime, type Effect } from 'effect'
import pc from 'picocolors'

// ============================================
// Types
// ============================================

export type OutputFormat = 'json' | 'table'

/** Column definition for display schemas */
export type Column<T> = {
  key: keyof T
  label: string
  width?: number
  format?: (value: unknown, row: T) => string
  color?: (value: unknown, row: T) => (s: string) => string
}

/** Display schema defines how to render a domain type */
export type DisplaySchema<T> = {
  columns: Column<T>[]
}

// ============================================
// Built-in Formatters
// ============================================

export const formatters = {
  /** Format DateTime or ISO string as YYYY-MM-DD */
  date: (v: unknown): string => {
    if (v === null || v === undefined) return '-'
    if (typeof v === 'string') return v.split('T')[0] ?? v
    if (DateTime.isDateTime(v)) return DateTime.formatIso(v).split('T')[0] ?? '-'
    return String(v)
  },

  /** Format number as weight with unit */
  weight: (v: unknown): string => {
    if (v === null || v === undefined) return '-'
    return `${Number(v).toFixed(1)} lbs`
  },

  /** Truncate string to max length */
  truncate:
    (maxLen: number) =>
    (v: unknown): string => {
      if (v === null || v === undefined) return '-'
      const str = String(v)
      if (str.length <= maxLen) return str
      return `${str.slice(0, maxLen - 1)}...`
    },

  /** Identity formatter - just convert to string */
  string: (v: unknown): string => {
    if (v === null || v === undefined) return '-'
    return String(v)
  },
}

// ============================================
// Rendering Functions
// ============================================

/** Strip ANSI codes to get actual string length */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes use control chars
const stripAnsi = (str: string): string => str.replace(/\x1b\[[0-9;]*m/g, '')

/** Pad string accounting for ANSI codes */
const padEnd = (str: string, width: number): string => {
  const visibleLength = stripAnsi(str).length
  const padding = Math.max(0, width - visibleLength)
  return str + ' '.repeat(padding)
}

/** Render data as a styled table */
const renderTable = <T>(data: readonly T[], schema: DisplaySchema<T>): string => {
  if (data.length === 0) {
    return pc.dim('No records found.')
  }

  // Build header
  const header = schema.columns.map((c) => pc.bold(padEnd(c.label, c.width ?? 15))).join('  ')

  // Calculate separator width based on visible header length
  const separatorWidth = stripAnsi(header).length
  const separator = pc.dim('─'.repeat(separatorWidth))

  // Build rows
  const rows = data.map((row) =>
    schema.columns
      .map((c) => {
        const raw = row[c.key]
        const formatted = c.format ? c.format(raw, row) : formatters.string(raw)
        const colorFn = c.color?.(raw, row) ?? ((s: string) => s)
        return padEnd(colorFn(formatted), c.width ?? 15)
      })
      .join('  '),
  )

  return [header, separator, ...rows].join('\n')
}

// ============================================
// Main Output Function
// ============================================

/**
 * Output data in the specified format.
 *
 * @param data - Single item or array of items to display
 * @param format - 'table' for human-readable, 'json' for scripts
 * @param schema - Display schema (required for table format with typed data)
 */
export function output<T>(data: T, format: OutputFormat, schema?: DisplaySchema<T>): Effect.Effect<void>
export function output<T>(data: readonly T[], format: OutputFormat, schema?: DisplaySchema<T>): Effect.Effect<void>
export function output<T>(
  data: T | readonly T[],
  format: OutputFormat,
  schema?: DisplaySchema<T>,
): Effect.Effect<void> {
  if (format === 'json') {
    return Console.log(JSON.stringify(data, null, 2))
  }

  // Table format
  if (schema) {
    const items = (Array.isArray(data) ? data : [data]) as readonly T[]
    return Console.log(renderTable(items, schema))
  }

  // Fallback to JSON if no schema provided
  return Console.log(JSON.stringify(data, null, 2))
}

// ============================================
// Message Helpers
// ============================================

/** Success message with checkmark */
export const success = (msg: string): Effect.Effect<void> => Console.log(`${pc.green('✓')} ${msg}`)

/** Error message with X */
export const error = (msg: string): Effect.Effect<void> => Console.error(`${pc.red('✗')} ${msg}`)
