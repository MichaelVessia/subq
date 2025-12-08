import { Command } from '@effect/cli'
import { weightAddCommand } from './add.js'
import { weightDeleteCommand } from './delete.js'
import { weightGetCommand } from './get.js'
import { weightListCommand } from './list.js'
import { weightUpdateCommand } from './update.js'

export const weightCommand = Command.make('weight').pipe(
  Command.withDescription('Manage weight logs'),
  Command.withSubcommands([
    weightListCommand,
    weightAddCommand,
    weightGetCommand,
    weightUpdateCommand,
    weightDeleteCommand,
  ]),
)
