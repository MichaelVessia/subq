import { Command } from '@effect/cli'
import { injectionAddCommand } from './add.js'
import { injectionDeleteCommand } from './delete.js'
import { injectionDrugsCommand } from './drugs.js'
import { injectionGetCommand } from './get.js'
import { injectionListCommand } from './list.js'
import { injectionSitesCommand } from './sites.js'
import { injectionUpdateCommand } from './update.js'

export const injectionCommand = Command.make('injection').pipe(
  Command.withDescription('Manage injection logs'),
  Command.withSubcommands([
    injectionListCommand,
    injectionAddCommand,
    injectionGetCommand,
    injectionUpdateCommand,
    injectionDeleteCommand,
    injectionDrugsCommand,
    injectionSitesCommand,
  ]),
)
