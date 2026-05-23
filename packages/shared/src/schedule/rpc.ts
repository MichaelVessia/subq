import { Rpc, RpcGroup } from 'effect/unstable/rpc'
import { Schema } from 'effect'
import { InjectionScheduleId } from './domain.js'
import {
  InjectionSchedule,
  InjectionScheduleCreate,
  InjectionScheduleDelete,
  InjectionScheduleUpdate,
  NextScheduledDose,
  ScheduleView,
} from './domain.js'

// ============================================
// Schedule Errors
// ============================================

export class ScheduleNotFoundError extends Schema.TaggedClass<ScheduleNotFoundError>()('ScheduleNotFoundError', {
  id: Schema.String,
}) {}

export class ScheduleDatabaseError extends Schema.TaggedClass<ScheduleDatabaseError>()('ScheduleDatabaseError', {
  operation: Schema.Literals(['insert', 'update', 'delete', 'query'] as const),
  cause: Schema.Defect,
}) {}

// ============================================
// Schedule RPCs
// ============================================

export const ScheduleRpcs = RpcGroup.make(
  Rpc.make('ScheduleList', {
    success: Schema.Array(InjectionSchedule),
    error: ScheduleDatabaseError,
  }),
  Rpc.make('ScheduleGetActive', {
    success: Schema.NullOr(InjectionSchedule),
    error: ScheduleDatabaseError,
  }),
  Rpc.make('ScheduleGet', {
    payload: Schema.Struct({ id: InjectionScheduleId }),
    success: Schema.NullOr(InjectionSchedule),
    error: ScheduleDatabaseError,
  }),
  Rpc.make('ScheduleCreate', {
    payload: InjectionScheduleCreate,
    success: InjectionSchedule,
    error: ScheduleDatabaseError,
  }),
  Rpc.make('ScheduleUpdate', {
    payload: InjectionScheduleUpdate,
    success: InjectionSchedule,
    error: Schema.Union([ScheduleNotFoundError, ScheduleDatabaseError]),
  }),
  Rpc.make('ScheduleDelete', {
    payload: InjectionScheduleDelete,
    success: Schema.Boolean,
    error: ScheduleDatabaseError,
  }),
  Rpc.make('ScheduleGetNextDose', {
    success: Schema.NullOr(NextScheduledDose),
    error: ScheduleDatabaseError,
  }),
  Rpc.make('ScheduleGetView', {
    payload: Schema.Struct({ id: InjectionScheduleId }),
    success: Schema.NullOr(ScheduleView),
    error: ScheduleDatabaseError,
  }),
)
