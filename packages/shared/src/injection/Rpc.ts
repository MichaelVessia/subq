import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema } from 'effect'
import { InjectionLogDatabaseError, InjectionLogNotFoundError } from '../errors/index.js'
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
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogGet', {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.NullOr(InjectionLog),
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogCreate', {
    payload: InjectionLogCreate,
    success: InjectionLog,
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogUpdate', {
    payload: InjectionLogUpdate,
    success: InjectionLog,
    error: Schema.Union(InjectionLogNotFoundError, InjectionLogDatabaseError),
  }),
  Rpc.make('InjectionLogDelete', {
    payload: InjectionLogDelete,
    success: Schema.Boolean,
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogGetDrugs', {
    success: Schema.Array(Schema.String),
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogGetSites', {
    success: Schema.Array(Schema.String),
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogGetLastSite', {
    success: Schema.NullOr(Schema.String),
    error: InjectionLogDatabaseError,
  }),
)
