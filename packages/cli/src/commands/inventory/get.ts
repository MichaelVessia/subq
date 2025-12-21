import { Args, Command, Options } from '@effect/cli'
import { Console, Effect } from 'effect'

import { InventoryDisplay } from '../../lib/display-schemas.js'
import { type OutputFormat, output } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
)

const idArg = Args.text({ name: 'id' }).pipe(Args.withDescription('Inventory item ID'))

export const inventoryGetCommand = Command.make('get', { format: formatOption, id: idArg }, ({ format, id }) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    const item = yield* api.call((client) => client.InventoryGet({ id }))

    if (item === null) {
      yield* Console.error(`Inventory item not found: ${id}`)
      return
    }

    yield* output(item, format as OutputFormat, InventoryDisplay)
  }),
).pipe(Command.withDescription('Get a single inventory item by ID'))
