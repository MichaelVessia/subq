import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema } from 'effect'
import { WeightLogDatabaseError, WeightLogNotFoundError } from '../errors/index.js'
import { WeightLog, WeightLogCreate, WeightLogDelete, WeightLogListParams, WeightLogUpdate } from './WeightLog.js'

// ============================================
// Weight Log RPCs
// ============================================

export const WeightRpcs = RpcGroup.make(
  Rpc.make('WeightLogList', {
    payload: WeightLogListParams,
    success: Schema.Array(WeightLog),
    error: WeightLogDatabaseError,
  }),
  Rpc.make('WeightLogGet', {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.NullOr(WeightLog),
    error: WeightLogDatabaseError,
  }),
  Rpc.make('WeightLogCreate', {
    payload: WeightLogCreate,
    success: WeightLog,
    error: WeightLogDatabaseError,
  }),
  Rpc.make('WeightLogUpdate', {
    payload: WeightLogUpdate,
    success: WeightLog,
    error: Schema.Union(WeightLogNotFoundError, WeightLogDatabaseError),
  }),
  Rpc.make('WeightLogDelete', {
    payload: WeightLogDelete,
    success: Schema.Boolean,
    error: WeightLogDatabaseError,
  }),
)
