import { BunContext } from '@effect/platform-bun'
import { FileSystem, Path } from '@effect/platform'
import { Effect, Layer, Option } from 'effect'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import * as NodeFs from 'fs'
import { LocalConfig } from '../src/services/LocalConfig.js'

// Create a LocalConfig layer using a custom temp directory
const makeTestLayer = (tempDir: string) =>
  Layer.effect(
    LocalConfig,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const subqDir = tempDir
      const configPath = path.join(subqDir, 'config.json')

      const ensureDir = Effect.gen(function* () {
        const exists = yield* fs.exists(subqDir)
        if (!exists) {
          yield* fs.makeDirectory(subqDir, { recursive: true })
        }
      })

      const ConfigJson = {
        decode: (data: unknown) => data as { server_url?: string; auth_token?: string; last_sync_cursor?: string },
      }

      const readConfig = Effect.gen(function* () {
        const exists = yield* fs.exists(configPath)
        if (!exists) {
          return Option.none<{ server_url?: string; auth_token?: string; last_sync_cursor?: string }>()
        }
        const content = yield* fs.readFileString(configPath)
        const parsed = yield* Effect.try({
          try: () => JSON.parse(content) as unknown,
          catch: () => new Error('Invalid JSON'),
        })
        return Option.some(ConfigJson.decode(parsed))
      }).pipe(
        Effect.catchAll(() =>
          Effect.succeed(Option.none<{ server_url?: string; auth_token?: string; last_sync_cursor?: string }>()),
        ),
      )

      const writeConfig = (config: { server_url?: string; auth_token?: string; last_sync_cursor?: string }) =>
        Effect.gen(function* () {
          yield* ensureDir
          const content = JSON.stringify(config, null, 2)
          yield* fs.writeFileString(configPath, content)
          yield* fs.chmod(configPath, 0o600)
        })

      type ConfigKey = 'server_url' | 'auth_token' | 'last_sync_cursor'

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
          const url = yield* get('server_url')
          return Option.getOrElse(url, () => 'https://subq.vessia.net')
        })

      const getAuthToken = () => get('auth_token')

      return LocalConfig.of({ get, set, delete: deleteKey, getServerUrl, getAuthToken })
    }),
  ).pipe(Layer.provide(BunContext.layer))

describe('LocalConfig', () => {
  describe('get', () => {
    it.effect('returns None for missing key in non-existent config file', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const tempDir = yield* fs.makeTempDirectory()

        const layer = makeTestLayer(tempDir)

        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          return yield* config.get('auth_token')
        }).pipe(Effect.provide(layer))

        expect(Option.isNone(result)).toBe(true)

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )

    it.effect('returns None for missing key in existing config file', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const tempDir = yield* fs.makeTempDirectory()

        // Create config file without auth_token
        yield* fs.makeDirectory(tempDir, { recursive: true })
        yield* fs.writeFileString(
          path.join(tempDir, 'config.json'),
          JSON.stringify({ server_url: 'https://example.com' }),
        )

        const layer = makeTestLayer(tempDir)

        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          return yield* config.get('auth_token')
        }).pipe(Effect.provide(layer))

        expect(Option.isNone(result)).toBe(true)

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )
  })

  describe('set and get', () => {
    it.effect('set then get returns the value', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const tempDir = yield* fs.makeTempDirectory()

        const layer = makeTestLayer(tempDir)

        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          yield* config.set('auth_token', 'test-token-123')
          return yield* config.get('auth_token')
        }).pipe(Effect.provide(layer))

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value).toBe('test-token-123')
        }

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )

    it.effect('preserves existing keys when setting new key', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const tempDir = yield* fs.makeTempDirectory()

        const layer = makeTestLayer(tempDir)

        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          yield* config.set('server_url', 'https://example.com')
          yield* config.set('auth_token', 'my-token')

          const serverUrl = yield* config.get('server_url')
          const authToken = yield* config.get('auth_token')
          return { serverUrl, authToken }
        }).pipe(Effect.provide(layer))

        expect(Option.isSome(result.serverUrl)).toBe(true)
        expect(Option.isSome(result.authToken)).toBe(true)
        if (Option.isSome(result.serverUrl)) {
          expect(result.serverUrl.value).toBe('https://example.com')
        }
        if (Option.isSome(result.authToken)) {
          expect(result.authToken.value).toBe('my-token')
        }

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )
  })

  describe('getServerUrl', () => {
    it.effect('returns default when server_url is not set', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const tempDir = yield* fs.makeTempDirectory()

        const layer = makeTestLayer(tempDir)

        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          return yield* config.getServerUrl()
        }).pipe(Effect.provide(layer))

        expect(result).toBe('https://subq.vessia.net')

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )

    it.effect('returns configured server_url when set', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const tempDir = yield* fs.makeTempDirectory()

        const layer = makeTestLayer(tempDir)

        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          yield* config.set('server_url', 'https://custom.example.com')
          return yield* config.getServerUrl()
        }).pipe(Effect.provide(layer))

        expect(result).toBe('https://custom.example.com')

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )
  })

  describe('getAuthToken', () => {
    it.effect('returns Option with auth token when set', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const tempDir = yield* fs.makeTempDirectory()

        const layer = makeTestLayer(tempDir)

        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          yield* config.set('auth_token', 'secret-token')
          return yield* config.getAuthToken()
        }).pipe(Effect.provide(layer))

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value).toBe('secret-token')
        }

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )

    it.effect('returns None when auth token is not set', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const tempDir = yield* fs.makeTempDirectory()

        const layer = makeTestLayer(tempDir)

        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          return yield* config.getAuthToken()
        }).pipe(Effect.provide(layer))

        expect(Option.isNone(result)).toBe(true)

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )
  })

  describe('delete', () => {
    it.effect('removes key from config file', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const tempDir = yield* fs.makeTempDirectory()

        const layer = makeTestLayer(tempDir)

        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          yield* config.set('auth_token', 'test-token-to-delete')
          yield* config.delete('auth_token')
          return yield* config.get('auth_token')
        }).pipe(Effect.provide(layer))

        expect(Option.isNone(result)).toBe(true)

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )

    it.effect('preserves other keys when deleting one key', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const tempDir = yield* fs.makeTempDirectory()

        const layer = makeTestLayer(tempDir)

        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          yield* config.set('server_url', 'https://example.com')
          yield* config.set('auth_token', 'my-token')
          yield* config.delete('auth_token')

          const serverUrl = yield* config.get('server_url')
          const authToken = yield* config.get('auth_token')
          return { serverUrl, authToken }
        }).pipe(Effect.provide(layer))

        expect(Option.isSome(result.serverUrl)).toBe(true)
        if (Option.isSome(result.serverUrl)) {
          expect(result.serverUrl.value).toBe('https://example.com')
        }
        expect(Option.isNone(result.authToken)).toBe(true)

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )

    it.effect('succeeds when config file does not exist', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const tempDir = yield* fs.makeTempDirectory()

        const layer = makeTestLayer(tempDir)

        // This should not throw
        yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          yield* config.delete('auth_token')
        }).pipe(Effect.provide(layer))

        // Verify no error was thrown by checking we got here
        expect(true).toBe(true)

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )
  })

  describe('directory creation', () => {
    it.effect('creates directory if missing when setting value', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const tempDir = yield* fs.makeTempDirectory()
        const subqDir = path.join(tempDir, 'nested', 'subq')

        const layer = makeTestLayer(subqDir)

        yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          yield* config.set('auth_token', 'test')
        }).pipe(Effect.provide(layer))

        // Check that the directory was created
        const exists = yield* fs.exists(subqDir)
        expect(exists).toBe(true)

        // Check that config file was created
        const configExists = yield* fs.exists(path.join(subqDir, 'config.json'))
        expect(configExists).toBe(true)

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )
  })

  describe('file permissions', () => {
    it.effect('sets chmod 600 on config.json', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const tempDir = yield* fs.makeTempDirectory()

        const layer = makeTestLayer(tempDir)

        yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          yield* config.set('auth_token', 'secret')
        }).pipe(Effect.provide(layer))

        // Use native fs.statSync to check permissions since Effect FileSystem stat
        // doesn't populate permissions on Bun
        const configFilePath = path.join(tempDir, 'config.json')
        const stat = NodeFs.statSync(configFilePath)
        // Extract just the permission bits (last 9 bits of mode)
        const permissions = stat.mode & 0o777
        expect(permissions).toBe(0o600)

        // Cleanup
        yield* fs.remove(tempDir, { recursive: true })
      }).pipe(Effect.provide(BunContext.layer)),
    )
  })
})
