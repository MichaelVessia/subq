import { FileSystem, Path } from '@effect/platform'
import type { PlatformError } from '@effect/platform/Error'
import { Context, Effect, Layer, Option, Schema } from 'effect'

// Session data stored locally
export class StoredSession extends Schema.Class<StoredSession>('StoredSession')({
  token: Schema.String,
  userId: Schema.String,
  email: Schema.String,
  expiresAt: Schema.Date,
  // Whether to use __Secure- prefix for cookie (HTTPS)
  isSecure: Schema.optionalWith(Schema.Boolean, { default: () => false }),
}) {}

export interface SessionService {
  readonly get: () => Effect.Effect<Option.Option<StoredSession>>
  readonly save: (session: StoredSession) => Effect.Effect<void, PlatformError>
  readonly clear: () => Effect.Effect<void, PlatformError>
}

export class Session extends Context.Tag('@subq/cli/Session')<Session, SessionService>() {
  static readonly layer = Layer.effect(
    Session,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const configDir = path.join(process.env.HOME ?? '~', '.config', 'subq')
      const sessionFile = path.join(configDir, 'session.json')

      const ensureConfigDir = Effect.gen(function* () {
        const exists = yield* fs.exists(configDir)
        if (!exists) {
          yield* fs.makeDirectory(configDir, { recursive: true })
        }
      })

      const get = () =>
        Effect.gen(function* () {
          const exists = yield* fs.exists(sessionFile)
          if (!exists) {
            return Option.none<StoredSession>()
          }

          const content = yield* fs.readFileString(sessionFile)
          const parsed = yield* Effect.try(() => JSON.parse(content))
          const session = yield* Schema.decodeUnknown(StoredSession)(parsed).pipe(
            Effect.mapError(() => new Error('Invalid session format')),
          )

          // Check if expired
          if (session.expiresAt < new Date()) {
            yield* fs.remove(sessionFile)
            return Option.none<StoredSession>()
          }

          return Option.some(session)
        }).pipe(Effect.catchAll(() => Effect.succeed(Option.none<StoredSession>())))

      const save = (session: StoredSession) =>
        Effect.gen(function* () {
          yield* ensureConfigDir
          const content = JSON.stringify(session, null, 2)
          yield* fs.writeFileString(sessionFile, content)
        })

      const clear = () =>
        Effect.gen(function* () {
          const exists = yield* fs.exists(sessionFile)
          if (exists) {
            yield* fs.remove(sessionFile)
          }
        })

      return Session.of({ get, save, clear })
    }),
  )
}
