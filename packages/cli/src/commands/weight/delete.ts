import { Args, Command, Options, Prompt } from '@effect/cli'
import { WeightLogDelete, type WeightLogId } from '@subq/shared'
import { Effect } from 'effect'
import { error, success } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const idArg = Args.text({ name: 'id' }).pipe(Args.withDescription('Weight log ID'))

const yesOption = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Skip confirmation prompt'),
)

const confirmPrompt = Prompt.confirm({
  message: 'Are you sure you want to delete this weight log?',
  initial: false,
})

export const weightDeleteCommand = Command.make('delete', { id: idArg, yes: yesOption }, ({ id, yes }) =>
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

    const payload = new WeightLogDelete({ id: id as WeightLogId })
    const deleted = yield* api.call((client) => client.WeightLogDelete(payload))

    if (deleted) {
      yield* success(`Deleted weight log: ${id}`)
    } else {
      yield* error(`Failed to delete weight log: ${id}`)
    }
  }),
).pipe(Command.withDescription('Delete a weight log'))
