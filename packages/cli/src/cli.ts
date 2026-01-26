import { Command } from '@effect/cli'
import { Layer } from 'effect'
import { loginCommand, logoutCommand } from './commands/auth/index.js'
import { injectionCommand } from './commands/injection/index.js'
import { inventoryCommand } from './commands/inventory/index.js'
import { logCommand } from './commands/log.js'
import { statusCommand } from './commands/status.js'
import { syncCommand } from './commands/sync.js'
import { quickWeightCommand } from './commands/weight.js'
import { weightCommand } from './commands/weight/index.js'
import { ApiClient } from './services/api-client.js'
import { CliConfigService } from './services/config.js'
import { Session } from './services/session.js'

// The sync-based loginCommand is in ./commands/login.ts for local-first sync auth.
// The web-based loginCommand from ./commands/auth/login.ts is used for legacy web auth.
// TODO: Once local-first sync is fully integrated, replace with sync-based login.

// Root command
const rootCommand = Command.make('subq').pipe(
  Command.withDescription('SubQ CLI - manage your health tracking data'),
  Command.withSubcommands([
    logCommand,
    quickWeightCommand,
    weightCommand,
    injectionCommand,
    inventoryCommand,
    loginCommand,
    logoutCommand,
    statusCommand,
    syncCommand,
  ]),
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
