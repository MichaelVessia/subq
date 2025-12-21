import { Command, Options } from '@effect/cli'
import { type DrugName, type Limit, InjectionLogListParams } from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'

import { InjectionLogDisplay } from '../../lib/display-schemas.js'
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

const drugOption = Options.text('drug').pipe(
  Options.withAlias('d'),
  Options.optional,
  Options.withDescription('Filter by drug name'),
)

export const injectionListCommand = Command.make(
  'list',
  { format: formatOption, limit: limitOption, startDate: startDateOption, endDate: endDateOption, drug: drugOption },
  ({ format, limit, startDate, endDate, drug }) =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const params = new InjectionLogListParams({
        limit: limit as Limit,
        startDate: Option.isSome(startDate) ? DateTime.unsafeFromDate(startDate.value) : undefined,
        endDate: Option.isSome(endDate) ? DateTime.unsafeFromDate(endDate.value) : undefined,
        drug: Option.isSome(drug) ? (drug.value as DrugName) : undefined,
      })

      const injections = yield* api.call((client) => client.InjectionLogList(params))

      yield* output(injections, format as OutputFormat, InjectionLogDisplay)
    }),
).pipe(Command.withDescription('List injection logs'))
