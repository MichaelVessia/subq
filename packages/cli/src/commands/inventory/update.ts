import { Args, Command, Options } from '@effect/cli'
import {
  type DrugName,
  type DrugSource,
  type InventoryForm,
  type InventoryId,
  type InventoryStatus,
  type TotalAmount,
  InventoryUpdate,
} from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'

import { InventoryDisplay } from '../../lib/display-schemas.js'
import { type OutputFormat, output, success } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
)

const idArg = Args.text({ name: 'id' }).pipe(Args.withDescription('Inventory item ID'))

const drugOption = Options.text('drug').pipe(
  Options.withAlias('d'),
  Options.optional,
  Options.withDescription('New drug name'),
)

const sourceOption = Options.text('source').pipe(
  Options.withAlias('s'),
  Options.optional,
  Options.withDescription('New source/pharmacy'),
)

const formOption = Options.choice('form', ['vial', 'pen']).pipe(Options.optional, Options.withDescription('New form'))

const amountOption = Options.text('amount').pipe(
  Options.withAlias('a'),
  Options.optional,
  Options.withDescription('New total amount'),
)

const statusOption = Options.choice('status', ['new', 'opened', 'finished']).pipe(
  Options.optional,
  Options.withDescription('New status'),
)

const budOption = Options.date('bud').pipe(
  Options.optional,
  Options.withDescription('New beyond use date (YYYY-MM-DD)'),
)

export const inventoryUpdateCommand = Command.make(
  'update',
  {
    format: formatOption,
    id: idArg,
    drug: drugOption,
    source: sourceOption,
    form: formOption,
    amount: amountOption,
    status: statusOption,
    bud: budOption,
  },
  ({ format, id, drug, source, form, amount, status, bud }) =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const payload = new InventoryUpdate({
        id: id as InventoryId,
        drug: Option.isSome(drug) ? (drug.value as DrugName) : undefined,
        source: Option.isSome(source) ? (source.value as DrugSource) : undefined,
        form: Option.isSome(form) ? (form.value as InventoryForm) : undefined,
        totalAmount: Option.isSome(amount) ? (amount.value as TotalAmount) : undefined,
        status: Option.isSome(status) ? (status.value as InventoryStatus) : undefined,
        beyondUseDate: Option.isSome(bud) ? Option.some(DateTime.unsafeFromDate(bud.value)) : Option.none(),
      })

      const updated = yield* api.call((client) => client.InventoryUpdate(payload))

      if (format === 'table') {
        yield* success('Updated inventory item')
      }
      yield* output(updated, format as OutputFormat, InventoryDisplay)
    }),
).pipe(Command.withDescription('Update an existing inventory item'))
