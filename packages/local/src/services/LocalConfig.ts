import { FileSystem, Path } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import type { PlatformError } from '@effect/platform/Error'
import { Context, Effect, Layer, Option, Schema } from 'effect'

const DEFAULT_SERVER_URL = 'https://subq.vessia.net'

// Schema for config.json stored at ~/.subq/config.json
export class ConfigSchema extends Schema.Class<ConfigSchema>('ConfigSchema')({
  server_url: Schema.optionalWith(Schema.String, { as: 'Option' }),
  auth_token: Schema.optionalWith(Schema.String, { as: 'Option' }),
  last_sync_cursor: Schema.optionalWith(Schema.String, { as: 'Option' }),
}) {}

// The actual JSON representation (with undefined for missing keys)
const ConfigJson = Schema.Struct({
  server_url: Schema.optional(Schema.String),
  auth_token: Schema.optional(Schema.String),
  last_sync_cursor: Schema.optional(Schema.String),
})

type ConfigKey = 'server_url' | 'auth_token' | 'last_sync_cursor'

export interface LocalConfigService {
  readonly get: <K extends ConfigKey>(key: K) => Effect.Effect<Option.Option<string>, PlatformError>
  readonly set: <K extends ConfigKey>(key: K, value: string) => Effect.Effect<void, PlatformError>
  readonly delete: <K extends ConfigKey>(key: K) => Effect.Effect<void, PlatformError>
  readonly getServerUrl: () => Effect.Effect<string, PlatformError>
  readonly getAuthToken: () => Effect.Effect<Option.Option<string>, PlatformError>
}

export class LocalConfig extends Context.Tag('@subq/local/LocalConfig')<LocalConfig, LocalConfigService>() {
  static readonly layer = Layer.effect(
    LocalConfig,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const subqDir = path.join(process.env.HOME ?? '~', '.subq')
      const configPath = path.join(subqDir, 'config.json')

      const ensureDir = Effect.gen(function* () {
        const exists = yield* fs.exists(subqDir)
        if (!exists) {
          yield* fs.makeDirectory(subqDir, { recursive: true })
        }
      })

      const readConfig = Effect.gen(function* () {
        const exists = yield* fs.exists(configPath)
        if (!exists) {
          return Option.none<typeof ConfigJson.Type>()
        }
        const content = yield* fs.readFileString(configPath)
        const parsed = yield* Effect.try({
          try: () => JSON.parse(content) as unknown,
          catch: () => new Error('Invalid JSON'),
        })
        const config = yield* Schema.decodeUnknown(ConfigJson)(parsed).pipe(
          Effect.mapError(() => new Error('Invalid config format')),
        )
        return Option.some(config)
      }).pipe(Effect.catchAll(() => Effect.succeed(Option.none<typeof ConfigJson.Type>())))

      const writeConfig = (config: typeof ConfigJson.Type) =>
        Effect.gen(function* () {
          yield* ensureDir
          const content = JSON.stringify(config, null, 2)
          yield* fs.writeFileString(configPath, content)
          // Set file permissions to 600 (owner read/write only)
          yield* fs.chmod(configPath, 0o600)
        })

      const get = <K extends ConfigKey>(key: K) =>
        Effect.gen(function* () {
          const config = yield* readConfig
          if (Option.isNone(config)) {
            return Option.none<string>()
          }
          const value = config.value[key]
          return value !== undefined ? Option.some(value) : Option.none<string>()
        })

      const set = <K extends ConfigKey>(key: K, value: string) =>
        Effect.gen(function* () {
          const existingConfig = yield* readConfig
          const currentConfig = Option.getOrElse(existingConfig, () => ({}))
          const newConfig = { ...currentConfig, [key]: value }
          yield* writeConfig(newConfig)
        })

      const deleteKey = <K extends ConfigKey>(key: K) =>
        Effect.gen(function* () {
          const existingConfig = yield* readConfig
          if (Option.isNone(existingConfig)) {
            return
          }
          const currentConfig = { ...existingConfig.value }
          delete currentConfig[key]
          yield* writeConfig(currentConfig)
        })

      const getServerUrl = () =>
        Effect.gen(function* () {
          // Check environment variable first (useful for testing)
          const envUrl = process.env.SUBQ_API_URL
          if (envUrl !== undefined && envUrl !== '') {
            return envUrl
          }
          // Fall back to config file, then default
          const url = yield* get('server_url')
          return Option.getOrElse(url, () => DEFAULT_SERVER_URL)
        })

      const getAuthToken = () => get('auth_token')

      return LocalConfig.of({ get, set, delete: deleteKey, getServerUrl, getAuthToken })
    }),
  )

  // Layer with dependency on FileSystem and Path (via BunContext)
  static readonly Default = LocalConfig.layer.pipe(Layer.provide(BunContext.layer))
}
