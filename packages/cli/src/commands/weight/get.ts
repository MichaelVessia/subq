import { Args, Command, Options } from '@effect/cli'
import { Console, Effect } from 'effect'
import { output, type OutputFormat } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['json', 'table']).pipe(
  Options.withAlias('f'),
  Options.withDefault('json' as const),
  Options.withDescription('Output format'),
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

    if (format === 'table') {
      yield* Console.log(`ID:       ${weight.id}`)
      yield* Console.log(`Date:     ${weight.datetime.toISOString().split('T')[0]}`)
      yield* Console.log(`Weight:   ${weight.weight} lbs`)
      yield* Console.log(`Notes:    ${weight.notes ?? '-'}`)
      yield* Console.log(`Created:  ${weight.createdAt.toISOString()}`)
      yield* Console.log(`Updated:  ${weight.updatedAt.toISOString()}`)
    } else {
      yield* output(weight, format as OutputFormat)
    }
  }),
).pipe(Command.withDescription('Get a single weight log by ID'))
