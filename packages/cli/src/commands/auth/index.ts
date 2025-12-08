import { Command } from '@effect/cli'
import { loginCommand } from './login.js'
import { logoutCommand } from './logout.js'

export const authCommand = Command.make('auth').pipe(
  Command.withDescription('Authentication commands'),
  Command.withSubcommands([loginCommand, logoutCommand]),
)

// Re-export for direct access
export { loginCommand, logoutCommand }
