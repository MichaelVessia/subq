import { Args, Command, Options } from '@effect/cli'
import { type Weight, type WeightLogId, WeightLogUpdate } from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'
import { output, success, type OutputFormat } from '../../lib/output.js'
import { ApiClient } from '../../services/api-client.js'

const formatOption = Options.choice('format', ['json', 'table']).pipe(
  Options.withAlias('f'),
  Options.withDefault('json' as const),
  Options.withDescription('Output format'),
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

      const payload = new WeightLogUpdate({
        id: id as WeightLogId,
        weight: Option.isSome(weight) ? (weight.value as Weight) : undefined,
        datetime: Option.isSome(date) ? DateTime.unsafeFromDate(date.value) : undefined,
        notes: Option.isSome(notes) ? Option.some(notes.value as any) : Option.none(),
      })

      const updated = yield* api.call((client) => client.WeightLogUpdate(payload))

      if (format === 'table') {
        yield* success(
          `Updated weight log: ${updated.weight} lbs on ${DateTime.formatIso(updated.datetime).split('T')[0]}`,
        )
      } else {
        yield* output(updated, format as OutputFormat)
      }
    }),
).pipe(Command.withDescription('Update an existing weight log'))
