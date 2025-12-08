import { Console, type Effect } from 'effect'

export type OutputFormat = 'json' | 'table'

// Generic output function that formats data based on format option
export const output = <T>(data: T, format: OutputFormat): Effect.Effect<void> => {
  if (format === 'json') {
    return Console.log(JSON.stringify(data, null, 2))
  }
  // Table format - just pretty print for now
  return Console.log(JSON.stringify(data, null, 2))
}

// Simple table formatter for weight logs
export const formatWeightTable = (
  weights: ReadonlyArray<{
    id: string
    datetime: Date
    weight: number
    notes: string | null
  }>,
): string => {
  if (weights.length === 0) {
    return 'No weight logs found.'
  }

  const header = 'ID                                    | Date       | Weight  | Notes'
  const separator = '-'.repeat(header.length)
  const rows = weights.map((w) => {
    const date = w.datetime.toISOString().split('T')[0]
    const weight = w.weight.toFixed(1).padStart(6)
    const notes = w.notes ?? ''
    return `${w.id} | ${date} | ${weight} | ${notes}`
  })

  return [header, separator, ...rows].join('\n')
}

// Success message helper
export const success = (msg: string) => Console.log(`✓ ${msg}`)

// Error message helper
export const error = (msg: string) => Console.error(`✗ ${msg}`)
