import { Command, Options, Prompt } from '@effect/cli'
import { WeightLogCreate } from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'

import { WeightLogDisplay } from '../../lib/display-schemas.js'
import { type OutputFormat, output, success } from '../../lib/output.js'
import { validateNotes, validateWeight } from '../../lib/validators.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
)

const weightOption = Options.float('weight').pipe(
  Options.withAlias('w'),
  Options.optional,
  Options.withDescription('Weight in lbs'),
)

const dateOption = Options.date('date').pipe(
  Options.withAlias('d'),
  Options.optional,
  Options.withDescription('Date of measurement (YYYY-MM-DD), defaults to now'),
)

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
const weightPrompt = Prompt.float({
  message: 'Weight (lbs):',
  min: 0,
  validate: (n) => (n > 0 ? Effect.succeed(n) : Effect.fail('Weight must be positive')),
})

const datePrompt = Prompt.date({
  message: 'Date:',
  initial: new Date(),
})

const notesPrompt = Prompt.text({
  message: 'Notes (optional, press Enter to skip):',
  default: '',
})

export const weightAddCommand = Command.make(
  'add',
  {
    format: formatOption,
    weight: weightOption,
    date: dateOption,
    notes: notesOption,
    interactive: interactiveOption,
  },
  ({ format, weight: weightOpt, date: dateOpt, notes: notesOpt, interactive }) =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      // Get weight - from option or prompt if interactive
      let weight: number
      if (Option.isSome(weightOpt)) {
        weight = weightOpt.value
      } else if (interactive) {
        weight = yield* weightPrompt
      } else {
        return yield* Effect.fail(new Error('--weight is required (or use -i for interactive mode)'))
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

      // Get notes - from option or prompt if interactive
      let notes: string | undefined
      if (Option.isSome(notesOpt)) {
        notes = notesOpt.value
      } else if (interactive) {
        const notesInput = yield* notesPrompt
        notes = notesInput || undefined
      }

      const validatedWeight = yield* validateWeight(weight)
      const validatedNotes = notes ? yield* validateNotes(notes).pipe(Effect.map(Option.some)) : Option.none()

      const payload = new WeightLogCreate({
        weight: validatedWeight,
        datetime: DateTime.unsafeFromDate(datetime),
        notes: validatedNotes,
      })

      const created = yield* api.call((client) => client.WeightLogCreate(payload))

      if (format === 'table') {
        yield* success('Added weight log')
      }
      yield* output(created, format as OutputFormat, WeightLogDisplay)
    }),
).pipe(Command.withDescription('Add a new weight log entry'))
