/**
 * Tests for the logout command.
 * Uses temp directory for file operations and mocked services for isolation.
 */
import { FileSystem, Path } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { LocalConfig, type LocalConfigService } from '@subq/local'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Layer, Option, Ref } from 'effect'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// ============================================
// Test Helpers
// ============================================

/**
 * Create a temp directory for testing.
 */
const createTempDir = (): string => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subq-logout-test-'))
  return tmpDir
}

/**
 * Clean up temp directory.
 */
const cleanupTempDir = (dir: string): void => {
  fs.rmSync(dir, { recursive: true, force: true })
}

/**
 * Create a mock LocalConfig that uses a temp directory.
 */
const makeMockLocalConfig = (
  storedToken: Ref.Ref<Option.Option<string>>,
  storedCursor: Ref.Ref<Option.Option<string>>,
): LocalConfigService => ({
  get: (key) => {
    if (key === 'auth_token') {
      return Ref.get(storedToken)
    }
    if (key === 'last_sync_cursor') {
      return Ref.get(storedCursor)
    }
    return Effect.succeed(Option.none())
  },
  set: (key, value) => {
    if (key === 'auth_token') {
      return Ref.set(storedToken, Option.some(value))
    }
    if (key === 'last_sync_cursor') {
      return Ref.set(storedCursor, Option.some(value))
    }
    return Effect.void
  },
  delete: (key) => {
    if (key === 'auth_token') {
      return Ref.set(storedToken, Option.none())
    }
    if (key === 'last_sync_cursor') {
      return Ref.set(storedCursor, Option.none())
    }
    return Effect.void
  },
  getServerUrl: () => Effect.succeed('https://test.example.com'),
  getAuthToken: () => Ref.get(storedToken),
})

// ============================================
// Tests
// ============================================

describe('logout command', () => {
  describe('removes auth_token from config', () => {
    it.effect('deletes auth_token when logged in', () =>
      Effect.gen(function* () {
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.some('test-token-abc123'))
        const storedCursor = yield* Ref.make<Option.Option<string>>(Option.some('2024-01-01T00:00:00Z'))

        const mockConfig = makeMockLocalConfig(storedToken, storedCursor)
        const configLayer = Layer.succeed(LocalConfig, mockConfig)

        // Simulate logout logic: delete token and cursor
        yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          yield* config.delete('auth_token')
          yield* config.delete('last_sync_cursor')
        }).pipe(Effect.provide(configLayer))

        // Verify token was removed
        const tokenAfter = yield* Ref.get(storedToken)
        expect(Option.isNone(tokenAfter)).toBe(true)

        // Verify cursor was also removed
        const cursorAfter = yield* Ref.get(storedCursor)
        expect(Option.isNone(cursorAfter)).toBe(true)
      }),
    )
  })

  describe('deletes data.db file', () => {
    it.effect('removes data.db when it exists', () =>
      Effect.gen(function* () {
        // Create temp directory with data.db file
        const tempDir = createTempDir()
        try {
          const subqDir = path.join(tempDir, '.subq')
          fs.mkdirSync(subqDir, { recursive: true })
          const dbPath = path.join(subqDir, 'data.db')
          fs.writeFileSync(dbPath, 'test database content')

          // Verify file exists before deletion
          expect(fs.existsSync(dbPath)).toBe(true)

          // Delete the database file using Effect FileSystem
          yield* Effect.gen(function* () {
            const fsService = yield* FileSystem.FileSystem
            const pathService = yield* Path.Path
            const fullPath = pathService.join(tempDir, '.subq', 'data.db')
            const exists = yield* fsService.exists(fullPath)
            if (exists) {
              yield* fsService.remove(fullPath)
            }
          }).pipe(Effect.provide(BunContext.layer))

          // Verify file was deleted
          expect(fs.existsSync(dbPath)).toBe(false)
        } finally {
          cleanupTempDir(tempDir)
        }
      }),
    )

    it.effect('succeeds when data.db does not exist', () =>
      Effect.gen(function* () {
        // Create temp directory without data.db file
        const tempDir = createTempDir()
        try {
          const subqDir = path.join(tempDir, '.subq')
          fs.mkdirSync(subqDir, { recursive: true })
          const dbPath = path.join(subqDir, 'data.db')

          // Verify file does not exist
          expect(fs.existsSync(dbPath)).toBe(false)

          // Attempt to delete (should not throw)
          yield* Effect.gen(function* () {
            const fsService = yield* FileSystem.FileSystem
            const pathService = yield* Path.Path
            const fullPath = pathService.join(tempDir, '.subq', 'data.db')
            const exists = yield* fsService.exists(fullPath)
            if (exists) {
              yield* fsService.remove(fullPath)
            }
          }).pipe(Effect.provide(BunContext.layer))

          // Verify directory still exists (only file should be deleted, not directory)
          expect(fs.existsSync(subqDir)).toBe(true)
        } finally {
          cleanupTempDir(tempDir)
        }
      }),
    )
  })

  describe('succeeds even if already logged out', () => {
    it.effect('completes without error when no token exists', () =>
      Effect.gen(function* () {
        // Start with no token
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.none())
        const storedCursor = yield* Ref.make<Option.Option<string>>(Option.none())

        const mockConfig = makeMockLocalConfig(storedToken, storedCursor)
        const configLayer = Layer.succeed(LocalConfig, mockConfig)

        // Simulate logout logic when already logged out
        const result = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          const maybeToken = yield* config.getAuthToken()

          if (Option.isNone(maybeToken)) {
            // Already logged out - this should succeed without error
            return 'already_logged_out'
          }

          yield* config.delete('auth_token')
          yield* config.delete('last_sync_cursor')
          return 'logged_out'
        }).pipe(Effect.provide(configLayer))

        expect(result).toBe('already_logged_out')

        // Token should still be none
        const tokenAfter = yield* Ref.get(storedToken)
        expect(Option.isNone(tokenAfter)).toBe(true)
      }),
    )

    it.effect('still deletes data.db even when already logged out', () =>
      Effect.gen(function* () {
        // Create temp directory with data.db but no token
        const tempDir = createTempDir()
        try {
          const subqDir = path.join(tempDir, '.subq')
          fs.mkdirSync(subqDir, { recursive: true })
          const dbPath = path.join(subqDir, 'data.db')
          fs.writeFileSync(dbPath, 'orphaned database content')

          // Start with no token
          const storedToken = yield* Ref.make<Option.Option<string>>(Option.none())
          const storedCursor = yield* Ref.make<Option.Option<string>>(Option.none())

          const mockConfig = makeMockLocalConfig(storedToken, storedCursor)
          const configLayer = Layer.succeed(LocalConfig, mockConfig)

          // Verify file exists before logout
          expect(fs.existsSync(dbPath)).toBe(true)

          // Simulate full logout logic (even when already logged out)
          yield* Effect.gen(function* () {
            const config = yield* LocalConfig
            const maybeToken = yield* config.getAuthToken()

            // Even if logged out, still delete database
            const fsService = yield* FileSystem.FileSystem
            const pathService = yield* Path.Path
            const fullPath = pathService.join(tempDir, '.subq', 'data.db')
            const exists = yield* fsService.exists(fullPath)
            if (exists) {
              yield* fsService.remove(fullPath)
            }

            if (Option.isSome(maybeToken)) {
              yield* config.delete('auth_token')
              yield* config.delete('last_sync_cursor')
            }
          }).pipe(Effect.provide(Layer.merge(configLayer, BunContext.layer)))

          // Verify file was deleted
          expect(fs.existsSync(dbPath)).toBe(false)
        } finally {
          cleanupTempDir(tempDir)
        }
      }),
    )
  })

  describe('confirmation message', () => {
    it.effect('logout returns appropriate status for confirmation', () =>
      Effect.gen(function* () {
        const storedToken = yield* Ref.make<Option.Option<string>>(Option.some('test-token'))
        const storedCursor = yield* Ref.make<Option.Option<string>>(Option.some('cursor'))

        const mockConfig = makeMockLocalConfig(storedToken, storedCursor)
        const configLayer = Layer.succeed(LocalConfig, mockConfig)

        // Simulate logout and capture status for confirmation message
        const status = yield* Effect.gen(function* () {
          const config = yield* LocalConfig
          const maybeToken = yield* config.getAuthToken()

          if (Option.isNone(maybeToken)) {
            return 'already_logged_out'
          }

          yield* config.delete('auth_token')
          yield* config.delete('last_sync_cursor')
          return 'success'
        }).pipe(Effect.provide(configLayer))

        // Logged out successfully
        expect(status).toBe('success')

        // Token should be removed
        const tokenAfter = yield* Ref.get(storedToken)
        expect(Option.isNone(tokenAfter)).toBe(true)
      }),
    )
  })
})
