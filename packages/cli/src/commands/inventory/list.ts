import { Command, Options } from '@effect/cli'
import { type DrugName, type InventoryStatus, InventoryListParams } from '@subq/shared'
import { Effect, Option } from 'effect'

import { InventoryDisplay } from '../../lib/display-schemas.js'
import { type OutputFormat, output } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
)

const statusOption = Options.choice('status', ['new', 'opened', 'finished']).pipe(
  Options.withAlias('s'),
  Options.optional,
  Options.withDescription('Filter by status'),
)

const drugOption = Options.text('drug').pipe(
  Options.withAlias('d'),
  Options.optional,
  Options.withDescription('Filter by drug name'),
)

export const inventoryListCommand = Command.make(
  'list',
  { format: formatOption, status: statusOption, drug: drugOption },
  ({ format, status, drug }) =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const params = new InventoryListParams({
        status: Option.isSome(status) ? (status.value as InventoryStatus) : undefined,
        drug: Option.isSome(drug) ? (drug.value as DrugName) : undefined,
      })

      const items = yield* api.call((client) => client.InventoryList(params))

      yield* output(items, format as OutputFormat, InventoryDisplay)
    }),
).pipe(Command.withDescription('List inventory items'))
