import { Command } from '@effect/cli'
import { Effect } from 'effect'
import { success } from '../../lib/output.js'
import { Session } from '../../services/session.js'

export const logoutCommand = Command.make('logout', {}, () =>
  Effect.gen(function* () {
    const session = yield* Session

    yield* session.clear()
    yield* success('Logged out')
  }),
).pipe(Command.withDescription('Log out and clear stored session'))
