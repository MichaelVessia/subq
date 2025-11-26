import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema } from 'effect'
import { WeightLog, WeightLogCreate, WeightLogDelete, WeightLogListParams, WeightLogUpdate } from './WeightLog.js'

// ============================================
// Weight Log RPCs
// ============================================

export const WeightRpcs = RpcGroup.make(
  Rpc.make('WeightLogList', {
    payload: WeightLogListParams,
    success: Schema.Array(WeightLog),
  }),
  Rpc.make('WeightLogGet', {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.NullOr(WeightLog),
  }),
  Rpc.make('WeightLogCreate', {
    payload: WeightLogCreate,
    success: WeightLog,
  }),
  Rpc.make('WeightLogUpdate', {
    payload: WeightLogUpdate,
    success: WeightLog,
  }),
  Rpc.make('WeightLogDelete', {
    payload: WeightLogDelete,
    success: Schema.Boolean,
  }),
)
