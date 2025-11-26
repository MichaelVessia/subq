import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema } from 'effect'
import {
  InjectionLog,
  InjectionLogCreate,
  InjectionLogDelete,
  InjectionLogListParams,
  InjectionLogUpdate,
} from './InjectionLog.js'

// ============================================
// Injection Log RPCs
// ============================================

export const InjectionRpcs = RpcGroup.make(
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
