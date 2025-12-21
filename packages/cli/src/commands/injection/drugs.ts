import { Command, Options } from '@effect/cli'
import { Console, Effect } from 'effect'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
)

export const injectionDrugsCommand = Command.make('drugs', { format: formatOption }, ({ format }) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    const drugs = yield* api.call((client) => client.InjectionLogGetDrugs())

    if (format === 'json') {
      yield* Console.log(JSON.stringify(drugs, null, 2))
    } else {
      if (drugs.length === 0) {
        yield* Console.log('No drugs recorded yet.')
      } else {
        yield* Console.log('Known drugs:')
        for (const drug of drugs) {
          yield* Console.log(`  - ${drug}`)
        }
      }
    }
  }),
).pipe(Command.withDescription('List all known drug names from injection history'))
