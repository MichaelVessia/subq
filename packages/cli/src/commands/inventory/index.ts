import { Command } from '@effect/cli'
import { inventoryAddCommand } from './add.js'
import { inventoryDeleteCommand } from './delete.js'
import { inventoryFinishCommand } from './finish.js'
import { inventoryGetCommand } from './get.js'
import { inventoryListCommand } from './list.js'
import { inventoryOpenCommand } from './open.js'
import { inventoryUpdateCommand } from './update.js'

export const inventoryCommand = Command.make('inventory').pipe(
  Command.withDescription('Manage inventory items'),
  Command.withSubcommands([
    inventoryListCommand,
    inventoryAddCommand,
    inventoryGetCommand,
    inventoryUpdateCommand,
    inventoryDeleteCommand,
    inventoryOpenCommand,
    inventoryFinishCommand,
  ]),
)
