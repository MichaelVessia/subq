import { Rpc, RpcGroup } from 'effect/unstable/rpc'
import { Schema } from 'effect'

// ============================================
// Settings Errors (defined inline like Goals)
// ============================================

export class SettingsDatabaseError extends Schema.TaggedClass<SettingsDatabaseError>()('SettingsDatabaseError', {
  operation: Schema.Literals(['insert', 'update', 'query'] as const),
  cause: Schema.Defect,
}) {}

// ============================================
// Settings Types (defined inline)
// ============================================

export class UserSettings extends Schema.Class<UserSettings>('UserSettings')({
  id: Schema.String,
  weightUnit: Schema.Literals(['lbs', 'kg'] as const),
  remindersEnabled: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class UserSettingsUpdate extends Schema.Class<UserSettingsUpdate>('UserSettingsUpdate')({
  weightUnit: Schema.optional(Schema.Literals(['lbs', 'kg'] as const)),
  remindersEnabled: Schema.optional(Schema.Boolean),
}) {}

// ============================================
// Settings RPCs
// ============================================

export const SettingsRpcs = RpcGroup.make(
  Rpc.make('UserSettingsGet', {
    success: UserSettings,
    error: SettingsDatabaseError,
  }),
  Rpc.make('UserSettingsUpdate', {
    payload: UserSettingsUpdate,
    success: UserSettings,
    error: SettingsDatabaseError,
  }),
)
