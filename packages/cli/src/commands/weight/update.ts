import { Args, Command, Options } from '@effect/cli'
import { WeightLogUpdate } from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'

import { WeightLogDisplay } from '../../lib/display-schemas.js'
import { type OutputFormat, output, success } from '../../lib/output.js'
import { validateNotes, validateWeight, validateWeightLogId } from '../../lib/validators.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['table', 'json']).pipe(
  Options.withAlias('f'),
  Options.withDefault('table' as const),
  Options.withDescription('Output format (table for humans, json for scripts)'),
)

const idArg = Args.text({ name: 'id' }).pipe(Args.withDescription('Weight log ID'))

const weightOption = Options.float('weight').pipe(
  Options.withAlias('w'),
  Options.optional,
  Options.withDescription('New weight in lbs'),
)

const dateOption = Options.date('date').pipe(
  Options.withAlias('d'),
  Options.optional,
  Options.withDescription('New date (YYYY-MM-DD)'),
)

const notesOption = Options.text('notes').pipe(
  Options.withAlias('n'),
  Options.optional,
  Options.withDescription('New notes'),
)

export const weightUpdateCommand = Command.make(
  'update',
  { format: formatOption, id: idArg, weight: weightOption, date: dateOption, notes: notesOption },
  ({ format, id, weight, date, notes }) =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const validatedId = yield* validateWeightLogId(id)
      const validatedWeight = Option.isSome(weight) ? yield* validateWeight(weight.value) : undefined
      const validatedNotes = Option.isSome(notes)
        ? yield* validateNotes(notes.value).pipe(Effect.map(Option.some))
        : Option.none()

      const payload = new WeightLogUpdate({
        id: validatedId,
        weight: validatedWeight,
        datetime: Option.isSome(date) ? DateTime.unsafeFromDate(date.value) : undefined,
        notes: validatedNotes,
      })

      const updated = yield* api.call((client) => client.WeightLogUpdate(payload))

      if (format === 'table') {
        yield* success('Updated weight log')
      }
      yield* output(updated, format as OutputFormat, WeightLogDisplay)
    }),
).pipe(Command.withDescription('Update an existing weight log'))
