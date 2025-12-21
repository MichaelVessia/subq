import { Command, Options } from '@effect/cli'
import { type Limit, WeightLogListParams } from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'

import { WeightLogDisplay } from '../../lib/display-schemas.js'
import { type OutputFormat, output } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
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
        startDate: Option.isSome(startDate) ? DateTime.unsafeFromDate(startDate.value) : undefined,
        endDate: Option.isSome(endDate) ? DateTime.unsafeFromDate(endDate.value) : undefined,
      })

      const weights = yield* api.call((client) => client.WeightLogList(params))

      yield* output(weights, format as OutputFormat, WeightLogDisplay)
    }),
).pipe(Command.withDescription('List weight logs'))
