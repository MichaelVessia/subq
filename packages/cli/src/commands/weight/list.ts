import { Command, Options } from '@effect/cli'
import { type Limit, WeightLogListParams } from '@subq/shared'
import { Console, Effect, Option } from 'effect'
import { formatWeightTable, output, type OutputFormat } from '../../lib/output.js'
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

export const weightListCommand = Command.make(
  'list',
  { format: formatOption, limit: limitOption, startDate: startDateOption, endDate: endDateOption },
  ({ format, limit, startDate, endDate }) =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const params = new WeightLogListParams({
        limit: limit as Limit,
        startDate: Option.getOrUndefined(startDate),
        endDate: Option.getOrUndefined(endDate),
      })

      const weights = yield* api.call((client) => client.WeightLogList(params))

      if (format === 'table') {
        yield* Console.log(formatWeightTable(weights))
      } else {
        yield* output(weights, format as OutputFormat)
      }
    }),
).pipe(Command.withDescription('List weight logs'))
