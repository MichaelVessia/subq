import { Command, Options, Prompt } from '@effect/cli'
import {
  type Dosage,
  type DrugName,
  type DrugSource,
  type InjectionSite,
  type Notes,
  InjectionLogCreate,
} from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'

import { InjectionLogDisplay } from '../../lib/display-schemas.js'
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

const dosageOption = Options.text('dosage').pipe(
  Options.optional,
  Options.withDescription('Dosage amount (e.g., "0.5mg", "10 units")'),
)

const dateOption = Options.date('date').pipe(
  Options.optional,
  Options.withDescription('Date of injection (YYYY-MM-DD), defaults to now'),
)

const siteOption = Options.text('site').pipe(
  Options.withAlias('s'),
  Options.optional,
  Options.withDescription('Injection site (e.g., "left abdomen")'),
)

const sourceOption = Options.text('source').pipe(Options.optional, Options.withDescription('Drug source/pharmacy'))

const notesOption = Options.text('notes').pipe(
  Options.withAlias('n'),
  Options.optional,
  Options.withDescription('Optional notes'),
)

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

const dosagePrompt = Prompt.text({
  message: 'Dosage (e.g., "0.5mg"):',
  validate: (s) => (s.trim() ? Effect.succeed(s.trim()) : Effect.fail('Dosage is required')),
})

const datePrompt = Prompt.date({
  message: 'Date:',
  initial: new Date(),
})

const sitePrompt = Prompt.text({
  message: 'Injection site (optional, press Enter to skip):',
  default: '',
})

const sourcePrompt = Prompt.text({
  message: 'Source/pharmacy (optional, press Enter to skip):',
  default: '',
})

const notesPrompt = Prompt.text({
  message: 'Notes (optional, press Enter to skip):',
  default: '',
})

export const injectionAddCommand = Command.make(
  'add',
  {
    format: formatOption,
    drug: drugOption,
    dosage: dosageOption,
    date: dateOption,
    site: siteOption,
    source: sourceOption,
    notes: notesOption,
    interactive: interactiveOption,
  },
  ({
    format,
    drug: drugOpt,
    dosage: dosageOpt,
    date: dateOpt,
    site: siteOpt,
    source: sourceOpt,
    notes: notesOpt,
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
        return yield* Effect.fail(new Error('--drug is required (or use -i for interactive mode)'))
      }

      // Get dosage - from option or prompt if interactive
      let dosage: string
      if (Option.isSome(dosageOpt)) {
        dosage = dosageOpt.value
      } else if (interactive) {
        dosage = yield* dosagePrompt
      } else {
        return yield* Effect.fail(new Error('--dosage is required (or use -i for interactive mode)'))
      }

      // Get date - from option, prompt if interactive, or default to now
      let datetime: Date
      if (Option.isSome(dateOpt)) {
        datetime = dateOpt.value
      } else if (interactive) {
        datetime = yield* datePrompt
      } else {
        datetime = new Date()
      }

      // Get site - from option or prompt if interactive
      let site: string | undefined
      if (Option.isSome(siteOpt)) {
        site = siteOpt.value
      } else if (interactive) {
        const siteInput = yield* sitePrompt
        site = siteInput || undefined
      }

      // Get source - from option or prompt if interactive
      let source: string | undefined
      if (Option.isSome(sourceOpt)) {
        source = sourceOpt.value
      } else if (interactive) {
        const sourceInput = yield* sourcePrompt
        source = sourceInput || undefined
      }

      // Get notes - from option or prompt if interactive
      let notes: string | undefined
      if (Option.isSome(notesOpt)) {
        notes = notesOpt.value
      } else if (interactive) {
        const notesInput = yield* notesPrompt
        notes = notesInput || undefined
      }

      const payload = new InjectionLogCreate({
        datetime: DateTime.unsafeFromDate(datetime),
        drug: drug as DrugName,
        dosage: dosage as Dosage,
        source: source ? Option.some(source as DrugSource) : Option.none(),
        injectionSite: site ? Option.some(site as InjectionSite) : Option.none(),
        notes: notes ? Option.some(notes as Notes) : Option.none(),
      })

      const created = yield* api.call((client) => client.InjectionLogCreate(payload))

      if (format === 'table') {
        yield* success('Added injection log')
      }
      yield* output(created, format as OutputFormat, InjectionLogDisplay)
    }),
).pipe(Command.withDescription('Add a new injection log entry'))
