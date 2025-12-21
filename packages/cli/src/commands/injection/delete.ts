import { Args, Command, Options, Prompt } from '@effect/cli'
import { InjectionLogDelete, type InjectionLogId } from '@subq/shared'
import { Effect } from 'effect'
import { error, success } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const idArg = Args.text({ name: 'id' }).pipe(Args.withDescription('Injection log ID'))

const yesOption = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Skip confirmation prompt'),
)

const confirmPrompt = Prompt.confirm({
  message: 'Are you sure you want to delete this injection log?',
  initial: false,
})

export const injectionDeleteCommand = Command.make('delete', { id: idArg, yes: yesOption }, ({ id, yes }) =>
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

    const payload = new InjectionLogDelete({ id: id as InjectionLogId })
    const deleted = yield* api.call((client) => client.InjectionLogDelete(payload))

    if (deleted) {
      yield* success(`Deleted injection log: ${id}`)
    } else {
      yield* error(`Failed to delete injection log: ${id}`)
    }
  }),
).pipe(Command.withDescription('Delete an injection log'))
