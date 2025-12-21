import { Args, Command, Options, Prompt } from '@effect/cli'
import { InventoryDelete, type InventoryId } from '@subq/shared'
import { Effect } from 'effect'
import { error, success } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const idArg = Args.text({ name: 'id' }).pipe(Args.withDescription('Inventory item ID'))

const yesOption = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Skip confirmation prompt'),
)

const confirmPrompt = Prompt.confirm({
  message: 'Are you sure you want to delete this inventory item?',
  initial: false,
})

export const inventoryDeleteCommand = Command.make('delete', { id: idArg, yes: yesOption }, ({ id, yes }) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    // Confirm deletion unless --yes flag is set
    if (!yes) {
      const confirmed = yield* confirmPrompt
      if (!confirmed) {
        yield* error('Deletion cancelled')
        return
      }
    }

    const payload = new InventoryDelete({ id: id as InventoryId })
    const deleted = yield* api.call((client) => client.InventoryDelete(payload))

    if (deleted) {
      yield* success(`Deleted inventory item: ${id}`)
    } else {
      yield* error(`Failed to delete inventory item: ${id}`)
    }
  }),
).pipe(Command.withDescription('Delete an inventory item'))
