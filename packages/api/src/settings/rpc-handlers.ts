import { AuthContext, SettingsRpcs, type UserSettingsUpdate } from '@subq/shared'
import { Effect, Option } from 'effect'
import { SettingsRepo } from './settings-repo.js'

export const SettingsRpcHandlersLive = SettingsRpcs.toLayer(
  Effect.gen(function* () {
    const settingsRepo = yield* SettingsRepo

    const UserSettingsGet = Effect.fn('rpc.settings.get')(function* () {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('UserSettingsGet called').pipe(
        Effect.annotateLogs({ rpc: 'UserSettingsGet', userId: user.id }),
      )

      // Get existing settings or create default
      const existing = yield* settingsRepo.get(user.id)
      if (Option.isSome(existing)) {
        yield* Effect.logDebug('UserSettingsGet found existing').pipe(
          Effect.annotateLogs({ rpc: 'UserSettingsGet', weightUnit: existing.value.weightUnit }),
        )
        return existing.value
      }

      // Create default settings
      yield* Effect.logDebug('UserSettingsGet creating default settings')
      const result = yield* settingsRepo.upsert(user.id, { weightUnit: 'lbs' })
      yield* Effect.logDebug('UserSettingsGet completed').pipe(
        Effect.annotateLogs({ rpc: 'UserSettingsGet', weightUnit: result.weightUnit }),
      )
      return result
    })

    const UserSettingsUpdate = Effect.fn('rpc.settings.update')(function* (data: UserSettingsUpdate) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('UserSettingsUpdate called').pipe(
        Effect.annotateLogs({ rpc: 'UserSettingsUpdate', userId: user.id, weightUnit: data.weightUnit }),
      )
      const result = yield* settingsRepo.upsert(user.id, data)
      yield* Effect.logInfo('UserSettingsUpdate completed').pipe(
        Effect.annotateLogs({ rpc: 'UserSettingsUpdate', weightUnit: result.weightUnit }),
      )
      return result
    })

    return {
      UserSettingsGet,
      UserSettingsUpdate,
    }
  }),
)
