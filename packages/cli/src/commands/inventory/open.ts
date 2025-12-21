import { Args, Command, Options } from '@effect/cli'
import { InventoryMarkOpened, type InventoryId } from '@subq/shared'
import { Effect } from 'effect'

import { InventoryDisplay } from '../../lib/display-schemas.js'
import { type OutputFormat, output, success } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
)

const idArg = Args.text({ name: 'id' }).pipe(Args.withDescription('Inventory item ID'))

export const inventoryOpenCommand = Command.make('open', { format: formatOption, id: idArg }, ({ format, id }) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    const payload = new InventoryMarkOpened({ id: id as InventoryId })
    const updated = yield* api.call((client) => client.InventoryMarkOpened(payload))

    if (format === 'table') {
      yield* success('Marked inventory item as opened')
    }
    yield* output(updated, format as OutputFormat, InventoryDisplay)
  }),
).pipe(Command.withDescription('Mark an inventory item as opened'))
