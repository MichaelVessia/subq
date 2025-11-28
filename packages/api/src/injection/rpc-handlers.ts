import {
  AuthContext,
  type InjectionLogBulkAssignSchedule,
  type InjectionLogCreate,
  type InjectionLogListParams,
  type InjectionLogUpdate,
  InjectionRpcs,
} from '@subq/shared'
import { Effect, Option } from 'effect'
import { InjectionLogRepo } from './injection-log-repo.js'

export const InjectionRpcHandlersLive = InjectionRpcs.toLayer(
  Effect.gen(function* () {
    const repo = yield* InjectionLogRepo

    const InjectionLogList = Effect.fn('rpc.injection.list')(function* (params: InjectionLogListParams) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* repo.list(params, user.id)
      yield* Effect.annotateCurrentSpan('count', result.length)
      return result
    })

    const InjectionLogGet = Effect.fn('rpc.injection.get')(function* ({ id }: { id: string }) {
      yield* Effect.annotateCurrentSpan('id', id)
      const result = yield* repo.findById(id).pipe(Effect.map(Option.getOrNull))
      yield* Effect.annotateCurrentSpan('found', !!result)
      return result
    })

    const InjectionLogCreate = Effect.fn('rpc.injection.create')(function* (data: InjectionLogCreate) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      yield* Effect.annotateCurrentSpan('drug', data.drug)
      yield* Effect.annotateCurrentSpan('site', data.injectionSite)
      const result = yield* repo.create(data, user.id)
      yield* Effect.annotateCurrentSpan('resultId', result.id)
      return result
    })

    const InjectionLogUpdate = Effect.fn('rpc.injection.update')(function* (data: InjectionLogUpdate) {
      yield* Effect.annotateCurrentSpan('id', data.id)
      const result = yield* repo.update(data)
      return result
    })

    const InjectionLogDelete = Effect.fn('rpc.injection.delete')(function* ({ id }: { id: string }) {
      yield* Effect.annotateCurrentSpan('id', id)
      const result = yield* repo.delete(id)
      yield* Effect.annotateCurrentSpan('success', result)
      return result
    })

    const InjectionLogGetDrugs = Effect.fn('rpc.injection.getDrugs')(function* () {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* repo.getUniqueDrugs(user.id)
      yield* Effect.annotateCurrentSpan('count', result.length)
      return result
    })

    const InjectionLogGetSites = Effect.fn('rpc.injection.getSites')(function* () {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* repo.getUniqueSites(user.id)
      yield* Effect.annotateCurrentSpan('count', result.length)
      return result
    })

    const InjectionLogGetLastSite = Effect.fn('rpc.injection.getLastSite')(function* () {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* repo.getLastSite(user.id)
      yield* Effect.annotateCurrentSpan('site', result ?? 'none')
      return result
    })

    const InjectionLogBulkAssignSchedule = Effect.fn('rpc.injection.bulkAssignSchedule')(function* (
      data: InjectionLogBulkAssignSchedule,
    ) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      yield* Effect.annotateCurrentSpan('count', data.ids.length)
      yield* Effect.annotateCurrentSpan('scheduleId', data.scheduleId ?? 'null')
      const result = yield* repo.bulkAssignSchedule(data, user.id)
      yield* Effect.annotateCurrentSpan('updated', result)
      return result
    })

    return {
      InjectionLogList,
      InjectionLogGet,
      InjectionLogCreate,
      InjectionLogUpdate,
      InjectionLogDelete,
      InjectionLogGetDrugs,
      InjectionLogGetSites,
      InjectionLogGetLastSite,
      InjectionLogBulkAssignSchedule,
    }
  }),
)
