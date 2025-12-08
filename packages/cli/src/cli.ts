import { Command } from '@effect/cli'
import { Layer } from 'effect'
import { loginCommand, logoutCommand } from './commands/auth/index.js'
import { weightCommand } from './commands/weight/index.js'
import { ApiClient } from './services/api-client.js'
import { CliConfigService } from './services/config.js'
import { Session } from './services/session.js'

// Root command
const rootCommand = Command.make('subq').pipe(
  Command.withDescription('SubQ CLI - manage your health tracking data'),
  Command.withSubcommands([weightCommand, loginCommand, logoutCommand]),
)

// Combined services layer
const servicesLayer = Layer.mergeAll(ApiClient.layer, CliConfigService.layer, Session.layer)

// Provide services to commands
const commandWithServices = rootCommand.pipe(Command.provide(servicesLayer))

// Export the CLI runner
export const cli = Command.run(commandWithServices, {
  name: 'subq',
  version: '0.0.0',
})
