import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema } from 'effect'

// ============================================
// Settings Errors (defined inline like Goals)
// ============================================

export class SettingsDatabaseError extends Schema.TaggedError<SettingsDatabaseError>()('SettingsDatabaseError', {
  operation: Schema.Literal('insert', 'update', 'query'),
  cause: Schema.Defect,
}) {}

// ============================================
// Settings Types (defined inline)
// ============================================

export class UserSettings extends Schema.Class<UserSettings>('UserSettings')({
  id: Schema.String,
  weightUnit: Schema.Literal('lbs', 'kg'),
  remindersEnabled: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class UserSettingsUpdate extends Schema.Class<UserSettingsUpdate>('UserSettingsUpdate')({
  weightUnit: Schema.optional(Schema.Literal('lbs', 'kg')),
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
