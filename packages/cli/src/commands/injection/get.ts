import { Args, Command, Options } from '@effect/cli'
import { Console, Effect } from 'effect'

import { InjectionLogDisplay } from '../../lib/display-schemas.js'
import { type OutputFormat, output } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
)

const idArg = Args.text({ name: 'id' }).pipe(Args.withDescription('Injection log ID'))

export const injectionGetCommand = Command.make('get', { format: formatOption, id: idArg }, ({ format, id }) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    const injection = yield* api.call((client) => client.InjectionLogGet({ id }))

    if (injection === null) {
      yield* Console.error(`Injection log not found: ${id}`)
      return
    }

    yield* output(injection, format as OutputFormat, InjectionLogDisplay)
  }),
).pipe(Command.withDescription('Get a single injection log by ID'))
