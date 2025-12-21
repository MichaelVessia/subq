import { Command, Options } from '@effect/cli'
import { Console, Effect } from 'effect'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
)

export const injectionSitesCommand = Command.make('sites', { format: formatOption }, ({ format }) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    const sites = yield* api.call((client) => client.InjectionLogGetSites())

    if (format === 'json') {
      yield* Console.log(JSON.stringify(sites, null, 2))
    } else {
      if (sites.length === 0) {
        yield* Console.log('No injection sites recorded yet.')
      } else {
        yield* Console.log('Known injection sites:')
        for (const site of sites) {
          yield* Console.log(`  - ${site}`)
        }
      }
    }
  }),
).pipe(Command.withDescription('List all known injection sites from history'))
