import { Command, Options } from '@effect/cli'
import { type Limit, type WeightLog, WeightLogListParams } from '@subq/shared'
import { Console, DateTime, Effect, Option } from 'effect'
import { output, type OutputFormat } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['json', 'table']).pipe(
  Options.withAlias('f'),
  Options.withDefault('json' as const),
  Options.withDescription('Output format'),
)

const limitOption = Options.integer('limit').pipe(
  Options.withAlias('l'),
  Options.withDefault(50),
  Options.withDescription('Maximum number of records to return'),
)

const startDateOption = Options.date('start-date').pipe(
  Options.optional,
  Options.withDescription('Filter by start date (YYYY-MM-DD)'),
)

const endDateOption = Options.date('end-date').pipe(
  Options.optional,
  Options.withDescription('Filter by end date (YYYY-MM-DD)'),
)

// Format weight logs for table display
const formatWeightTableFromLogs = (weights: readonly WeightLog[]): string => {
  if (weights.length === 0) {
    return 'No weight logs found.'
  }

  const header = 'ID                                    | Date       | Weight  | Notes'
  const separator = '-'.repeat(header.length)
  const rows = weights.map((w) => {
    const date = DateTime.formatIso(w.datetime).split('T')[0]
    const weight = w.weight.toFixed(1).padStart(6)
    const notes = w.notes ?? ''
    return `${w.id} | ${date} | ${weight} | ${notes}`
  })

  return [header, separator, ...rows].join('\n')
}

export const weightListCommand = Command.make(
  'list',
  { format: formatOption, limit: limitOption, startDate: startDateOption, endDate: endDateOption },
  ({ format, limit, startDate, endDate }) =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const params = new WeightLogListParams({
        limit: limit as Limit,
        startDate: Option.isSome(startDate) ? DateTime.unsafeFromDate(startDate.value) : undefined,
        endDate: Option.isSome(endDate) ? DateTime.unsafeFromDate(endDate.value) : undefined,
      })

      const weights = yield* api.call((client) => client.WeightLogList(params))

      if (format === 'table') {
        yield* Console.log(formatWeightTableFromLogs(weights))
      } else {
        yield* output(weights, format as OutputFormat)
      }
    }),
).pipe(Command.withDescription('List weight logs'))
