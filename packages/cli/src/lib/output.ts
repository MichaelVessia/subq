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

// Success message helper
export const success = (msg: string) => Console.log(`✓ ${msg}`)

// Error message helper
export const error = (msg: string) => Console.error(`✗ ${msg}`)
