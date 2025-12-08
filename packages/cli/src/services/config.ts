import { Config, Context, Effect, Layer } from 'effect'

export interface CliConfig {
  readonly apiUrl: string
}

export class CliConfigService extends Context.Tag('@subq/cli/Config')<CliConfigService, CliConfig>() {
  static readonly layer = Layer.effect(
    CliConfigService,
    Effect.gen(function* () {
      const apiUrl = yield* Config.string('SUBQ_API_URL').pipe(Config.withDefault('http://localhost:3001'))
      return { apiUrl }
    }),
  )
}
