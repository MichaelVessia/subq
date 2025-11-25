import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema } from 'effect'
import {
  WeightLog,
  WeightLogCreate,
  WeightLogUpdate,
  WeightLogDelete,
  WeightLogListParams,
  InjectionLog,
  InjectionLogCreate,
  InjectionLogUpdate,
  InjectionLogDelete,
  InjectionLogListParams,
} from './domain/index.js'

// ============================================
// Combined App RPCs - All RPCs in one group
// ============================================

export const AppRpcs = RpcGroup.make(
  // Greet (existing)
  Rpc.make('Greet', {
    success: Schema.String,
    payload: { name: Schema.String },
  }),

  // Weight Log RPCs
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

  // Injection Log RPCs
  Rpc.make('InjectionLogList', {
    payload: InjectionLogListParams,
    success: Schema.Array(InjectionLog),
  }),
  Rpc.make('InjectionLogGet', {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.NullOr(InjectionLog),
  }),
  Rpc.make('InjectionLogCreate', {
    payload: InjectionLogCreate,
    success: InjectionLog,
  }),
  Rpc.make('InjectionLogUpdate', {
    payload: InjectionLogUpdate,
    success: InjectionLog,
  }),
  Rpc.make('InjectionLogDelete', {
    payload: InjectionLogDelete,
    success: Schema.Boolean,
  }),
  Rpc.make('InjectionLogGetDrugs', {
    success: Schema.Array(Schema.String),
  }),
  Rpc.make('InjectionLogGetSites', {
    success: Schema.Array(Schema.String),
  }),
)
