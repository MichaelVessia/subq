import { Command, Options, Prompt } from '@effect/cli'
import {
  type DrugName,
  type DrugSource,
  type InventoryForm,
  type InventoryStatus,
  type TotalAmount,
  InventoryCreate,
} from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'

import { MissingArgumentError } from '../../errors.js'
import { InventoryDisplay } from '../../lib/display-schemas.js'
import { type OutputFormat, output, success } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
)

const drugOption = Options.text('drug').pipe(
  Options.withAlias('d'),
  Options.optional,
  Options.withDescription('Drug name (e.g., "Semaglutide")'),
)

const sourceOption = Options.text('source').pipe(
  Options.withAlias('s'),
  Options.optional,
  Options.withDescription('Source/pharmacy'),
)

const formOption = Options.choice('form', ['vial', 'pen']).pipe(
  Options.optional,
  Options.withDescription('Form: vial or pen'),
)

const amountOption = Options.text('amount').pipe(
  Options.withAlias('a'),
  Options.optional,
  Options.withDescription('Total amount (e.g., "10mg", "2.4mg")'),
)

const statusOption = Options.choice('status', ['new', 'opened', 'finished']).pipe(
  Options.optional,
  Options.withDescription('Initial status (default: new)'),
)

const budOption = Options.date('bud').pipe(Options.optional, Options.withDescription('Beyond use date (YYYY-MM-DD)'))

const interactiveOption = Options.boolean('interactive').pipe(
  Options.withAlias('i'),
  Options.withDefault(false),
  Options.withDescription('Interactive mode - prompt for missing values'),
)

// Interactive prompts
const drugPrompt = Prompt.text({
  message: 'Drug name:',
  validate: (s) => (s.trim() ? Effect.succeed(s.trim()) : Effect.fail('Drug name is required')),
})

const sourcePrompt = Prompt.text({
  message: 'Source/pharmacy:',
  validate: (s) => (s.trim() ? Effect.succeed(s.trim()) : Effect.fail('Source is required')),
})

const formPrompt = Prompt.select({
  message: 'Form:',
  choices: [
    { title: 'Vial (compounded)', value: 'vial' as const },
    { title: 'Pen (branded)', value: 'pen' as const },
  ],
})

const amountPrompt = Prompt.text({
  message: 'Total amount (e.g., "10mg"):',
  validate: (s) => (s.trim() ? Effect.succeed(s.trim()) : Effect.fail('Amount is required')),
})

const statusPrompt = Prompt.select({
  message: 'Status:',
  choices: [
    { title: 'New', value: 'new' as const },
    { title: 'Opened', value: 'opened' as const },
    { title: 'Finished', value: 'finished' as const },
  ],
})

const budPrompt = Prompt.date({
  message: 'Beyond use date (optional, Ctrl+C to skip):',
})

export const inventoryAddCommand = Command.make(
  'add',
  {
    format: formatOption,
    drug: drugOption,
    source: sourceOption,
    form: formOption,
    amount: amountOption,
    status: statusOption,
    bud: budOption,
    interactive: interactiveOption,
  },
  ({
    format,
    drug: drugOpt,
    source: sourceOpt,
    form: formOpt,
    amount: amountOpt,
    status: statusOpt,
    bud: budOpt,
    interactive,
  }) =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      // Get drug - from option or prompt if interactive
      let drug: string
      if (Option.isSome(drugOpt)) {
        drug = drugOpt.value
      } else if (interactive) {
        drug = yield* drugPrompt
      } else {
        return yield* Effect.fail(new MissingArgumentError({ argument: 'drug', hint: 'use -i for interactive mode' }))
      }

      // Get source - from option or prompt if interactive
      let source: string
      if (Option.isSome(sourceOpt)) {
        source = sourceOpt.value
      } else if (interactive) {
        source = yield* sourcePrompt
      } else {
        return yield* Effect.fail(new MissingArgumentError({ argument: 'source', hint: 'use -i for interactive mode' }))
      }

      // Get form - from option or prompt if interactive
      let form: 'vial' | 'pen'
      if (Option.isSome(formOpt)) {
        form = formOpt.value
      } else if (interactive) {
        form = yield* formPrompt
      } else {
        return yield* Effect.fail(new MissingArgumentError({ argument: 'form', hint: 'use -i for interactive mode' }))
      }

      // Get amount - from option or prompt if interactive
      let amount: string
      if (Option.isSome(amountOpt)) {
        amount = amountOpt.value
      } else if (interactive) {
        amount = yield* amountPrompt
      } else {
        return yield* Effect.fail(new MissingArgumentError({ argument: 'amount', hint: 'use -i for interactive mode' }))
      }

      // Get status - from option, prompt if interactive, or default to 'new'
      let status: 'new' | 'opened' | 'finished'
      if (Option.isSome(statusOpt)) {
        status = statusOpt.value
      } else if (interactive) {
        status = yield* statusPrompt
      } else {
        status = 'new'
      }

      // Get BUD - from option or skip (optional in interactive too)
      let bud: Date | undefined
      if (Option.isSome(budOpt)) {
        bud = budOpt.value
      } else if (interactive) {
        // BUD is optional, try to get it but don't fail
        const budResult = yield* Effect.either(budPrompt)
        if (budResult._tag === 'Right') {
          bud = budResult.right
        }
      }

      const payload = new InventoryCreate({
        drug: drug as DrugName,
        source: source as DrugSource,
        form: form as InventoryForm,
        totalAmount: amount as TotalAmount,
        status: status as InventoryStatus,
        beyondUseDate: bud ? Option.some(DateTime.unsafeFromDate(bud)) : Option.none(),
      })

      const created = yield* api.call((client) => client.InventoryCreate(payload))

      if (format === 'table') {
        yield* success('Added inventory item')
      }
      yield* output(created, format as OutputFormat, InventoryDisplay)
    }),
).pipe(Command.withDescription('Add a new inventory item'))
