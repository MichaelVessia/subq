import { SqlClient } from '@effect/sql'
import {
  AuthContext,
  CliSession,
  CliSessionList,
  RevokeCliSessionResponse,
  SettingsDatabaseError,
  SettingsRpcs,
  type RevokeCliSessionRequest,
  type UserSettingsUpdate,
} from '@subq/shared'
import { Effect, Option, Schema } from 'effect'
import { SettingsRepo } from './settings-repo.js'

// ============================================
// Session Row Schema
// ============================================

const SessionRow = Schema.Struct({
  id: Schema.String,
  device_name: Schema.NullOr(Schema.String),
  last_used_at: Schema.NullOr(Schema.String),
  created_at: Schema.Number,
})

const decodeSessionRow = Schema.decodeUnknown(SessionRow)

export const SettingsRpcHandlersLive = SettingsRpcs.toLayer(
  Effect.gen(function* () {
    const settingsRepo = yield* SettingsRepo
    const sql = yield* SqlClient.SqlClient

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

    const CliSessionListHandler = Effect.fn('rpc.settings.cliSessionList')(function* () {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('CliSessionList called').pipe(
        Effect.annotateLogs({ rpc: 'CliSessionList', userId: user.id }),
      )

      const rows = yield* sql`
        SELECT id, device_name, last_used_at, createdAt as created_at
        FROM session
        WHERE userId = ${user.id} AND type = 'cli'
        ORDER BY createdAt DESC
      `.pipe(Effect.mapError((cause) => SettingsDatabaseError.make({ operation: 'query', cause })))

      const sessions = yield* Effect.forEach(rows, (row) =>
        decodeSessionRow(row).pipe(
          Effect.map(
            (r) =>
              new CliSession({
                id: r.id,
                deviceName: r.device_name,
                lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
                createdAt: new Date(r.created_at),
              }),
          ),
          Effect.mapError((cause) => SettingsDatabaseError.make({ operation: 'query', cause })),
        ),
      )

      yield* Effect.logDebug('CliSessionList completed').pipe(
        Effect.annotateLogs({ rpc: 'CliSessionList', count: sessions.length }),
      )
      return new CliSessionList({ sessions })
    })

    const RevokeCliSession = Effect.fn('rpc.settings.revokeCliSession')(function* (data: RevokeCliSessionRequest) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('RevokeCliSession called').pipe(
        Effect.annotateLogs({ rpc: 'RevokeCliSession', userId: user.id, sessionId: data.sessionId }),
      )

      // Delete the session (only if it belongs to this user and is a CLI session)
      yield* sql`
        DELETE FROM session
        WHERE id = ${data.sessionId} AND userId = ${user.id} AND type = 'cli'
      `.pipe(Effect.mapError((cause) => SettingsDatabaseError.make({ operation: 'update', cause })))

      yield* Effect.logInfo('RevokeCliSession completed').pipe(
        Effect.annotateLogs({ rpc: 'RevokeCliSession', sessionId: data.sessionId }),
      )
      return new RevokeCliSessionResponse({ success: true })
    })

    return {
      UserSettingsGet,
      UserSettingsUpdate,
      CliSessionList: CliSessionListHandler,
      RevokeCliSession,
    }
  }),
)
