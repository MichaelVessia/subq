import { Args, Command, Options } from '@effect/cli'
import {
  type Dosage,
  type DrugName,
  type DrugSource,
  type InjectionLogId,
  type InjectionSite,
  type Notes,
  InjectionLogUpdate,
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

const idArg = Args.text({ name: 'id' }).pipe(Args.withDescription('Injection log ID'))

const drugOption = Options.text('drug').pipe(
  Options.withAlias('d'),
  Options.optional,
  Options.withDescription('New drug name'),
)

const dosageOption = Options.text('dosage').pipe(Options.optional, Options.withDescription('New dosage'))

const dateOption = Options.date('date').pipe(Options.optional, Options.withDescription('New date (YYYY-MM-DD)'))

const siteOption = Options.text('site').pipe(
  Options.withAlias('s'),
  Options.optional,
  Options.withDescription('New injection site'),
)

const sourceOption = Options.text('source').pipe(Options.optional, Options.withDescription('New source/pharmacy'))

const notesOption = Options.text('notes').pipe(
  Options.withAlias('n'),
  Options.optional,
  Options.withDescription('New notes'),
)

export const injectionUpdateCommand = Command.make(
  'update',
  {
    format: formatOption,
    id: idArg,
    drug: drugOption,
    dosage: dosageOption,
    date: dateOption,
    site: siteOption,
    source: sourceOption,
    notes: notesOption,
  },
  ({ format, id, drug, dosage, date, site, source, notes }) =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const payload = new InjectionLogUpdate({
        id: id as InjectionLogId,
        drug: Option.isSome(drug) ? (drug.value as DrugName) : undefined,
        dosage: Option.isSome(dosage) ? (dosage.value as Dosage) : undefined,
        datetime: Option.isSome(date) ? DateTime.unsafeFromDate(date.value) : undefined,
        injectionSite: Option.isSome(site) ? Option.some(site.value as InjectionSite) : Option.none(),
        source: Option.isSome(source) ? Option.some(source.value as DrugSource) : Option.none(),
        notes: Option.isSome(notes) ? Option.some(notes.value as Notes) : Option.none(),
      })

      const updated = yield* api.call((client) => client.InjectionLogUpdate(payload))

      if (format === 'table') {
        yield* success('Updated injection log')
      }
      yield* output(updated, format as OutputFormat, InjectionLogDisplay)
    }),
).pipe(Command.withDescription('Update an existing injection log'))
