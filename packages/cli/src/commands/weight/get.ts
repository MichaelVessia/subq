import { Args, Command, Options } from '@effect/cli'
import { Console, Effect } from 'effect'

import { WeightLogDisplay } from '../../lib/display-schemas.js'
import { type OutputFormat, output } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
)

const idArg = Args.text({ name: 'id' }).pipe(Args.withDescription('Weight log ID'))

export const weightGetCommand = Command.make('get', { format: formatOption, id: idArg }, ({ format, id }) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    const weight = yield* api.call((client) => client.WeightLogGet({ id }))

    if (weight === null) {
      yield* Console.error(`Weight log not found: ${id}`)
      return
    }

    yield* output(weight, format as OutputFormat, WeightLogDisplay)
  }),
).pipe(Command.withDescription('Get a single weight log by ID'))
