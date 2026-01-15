import { SqlClient } from '@effect/sql'
import { SettingsDatabaseError, UserSettings, type UserSettingsUpdate } from '@subq/shared'
import { Effect, Layer, Option, Schema } from 'effect'

// ============================================
// Database Row Schema
// ============================================

const SettingsRow = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  weight_unit: Schema.Literal('lbs', 'kg'),
  reminders_enabled: Schema.Number, // SQLite boolean as 0/1
  created_at: Schema.String,
  updated_at: Schema.String,
})

const decodeSettingsRow = Schema.decodeUnknown(SettingsRow)

// Schema for the partial row used in upsert's existing check
const CurrentSettingsRow = Schema.Struct({
  id: Schema.String,
  weight_unit: Schema.String,
  reminders_enabled: Schema.Number,
})
const decodeCurrentSettingsRow = Schema.decodeUnknown(CurrentSettingsRow)

const settingsRowToDomain = (row: typeof SettingsRow.Type): UserSettings =>
  new UserSettings({
    id: row.id,
    weightUnit: row.weight_unit,
    remindersEnabled: row.reminders_enabled === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  })

const generateUuid = () => crypto.randomUUID()

// ============================================
// Repository Service Definition
// ============================================

export class SettingsRepo extends Effect.Tag('SettingsRepo')<
  SettingsRepo,
  {
    readonly get: (userId: string) => Effect.Effect<Option.Option<UserSettings>, SettingsDatabaseError>
    readonly upsert: (userId: string, data: UserSettingsUpdate) => Effect.Effect<UserSettings, SettingsDatabaseError>
  }
>() {}

// ============================================
// Repository Implementation
// ============================================

export const SettingsRepoLive = Layer.effect(
  SettingsRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const get = (userId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT id, user_id, weight_unit, reminders_enabled, created_at, updated_at
          FROM user_settings
          WHERE user_id = ${userId}
        `
        if (rows.length === 0) {
          return Option.none()
        }
        const decoded = yield* decodeSettingsRow(rows[0])
        return Option.some(settingsRowToDomain(decoded))
      }).pipe(Effect.mapError((cause) => SettingsDatabaseError.make({ operation: 'query', cause })))

    const upsert = (userId: string, data: UserSettingsUpdate) =>
      Effect.gen(function* () {
        const now = new Date().toISOString()

        // Check if settings exist
        const existing =
          yield* sql`SELECT id, weight_unit, reminders_enabled FROM user_settings WHERE user_id = ${userId}`

        if (existing.length === 0) {
          // Insert new settings
          const id = generateUuid()
          const weightUnit = data.weightUnit ?? 'lbs'
          const remindersEnabled = data.remindersEnabled ?? true
          yield* sql`
            INSERT INTO user_settings (id, user_id, weight_unit, reminders_enabled, created_at, updated_at)
            VALUES (${id}, ${userId}, ${weightUnit}, ${remindersEnabled ? 1 : 0}, ${now}, ${now})
          `
        } else {
          // Update existing - build update dynamically
          const current = yield* decodeCurrentSettingsRow(existing[0])
          const weightUnit = data.weightUnit ?? current.weight_unit
          const remindersEnabled = data.remindersEnabled ?? current.reminders_enabled === 1
          yield* sql`
            UPDATE user_settings
            SET weight_unit = ${weightUnit}, reminders_enabled = ${remindersEnabled ? 1 : 0}, updated_at = ${now}
            WHERE user_id = ${userId}
          `
        }

        // Fetch and return
        const result = yield* get(userId)
        return Option.getOrThrow(result)
      }).pipe(Effect.mapError((cause) => SettingsDatabaseError.make({ operation: 'update', cause })))

    return { get, upsert }
  }),
)
