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
      yield* Effect.logDebug('InjectionLogList called').pipe(
        Effect.annotateLogs({
          rpc: 'InjectionLogList',
          userId: user.id,
          startDate: params.startDate?.toISOString() ?? 'none',
          endDate: params.endDate?.toISOString() ?? 'none',
          limit: params.limit,
        }),
      )
      const result = yield* repo.list(params, user.id)
      yield* Effect.logDebug('InjectionLogList completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogList', count: result.length }),
      )
      return result
    })

    const InjectionLogGet = Effect.fn('rpc.injection.get')(function* ({ id }: { id: string }) {
      yield* Effect.logDebug('InjectionLogGet called').pipe(Effect.annotateLogs({ rpc: 'InjectionLogGet', id }))
      const result = yield* repo.findById(id).pipe(Effect.map(Option.getOrNull))
      yield* Effect.logDebug('InjectionLogGet completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGet', id, found: !!result }),
      )
      return result
    })

    const InjectionLogCreate = Effect.fn('rpc.injection.create')(function* (data: InjectionLogCreate) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('InjectionLogCreate called').pipe(
        Effect.annotateLogs({
          rpc: 'InjectionLogCreate',
          userId: user.id,
          drug: data.drug,
          dosage: data.dosage,
          site: Option.getOrNull(data.injectionSite) ?? 'none',
        }),
      )
      const result = yield* repo.create(data, user.id)
      yield* Effect.logInfo('InjectionLogCreate completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogCreate', id: result.id, drug: result.drug }),
      )
      return result
    })

    const InjectionLogUpdate = Effect.fn('rpc.injection.update')(function* (data: InjectionLogUpdate) {
      yield* Effect.logInfo('InjectionLogUpdate called').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogUpdate', id: data.id }),
      )
      const result = yield* repo.update(data)
      yield* Effect.logInfo('InjectionLogUpdate completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogUpdate', id: result.id }),
      )
      return result
    })

    const InjectionLogDelete = Effect.fn('rpc.injection.delete')(function* ({ id }: { id: string }) {
      yield* Effect.logInfo('InjectionLogDelete called').pipe(Effect.annotateLogs({ rpc: 'InjectionLogDelete', id }))
      const result = yield* repo.delete(id)
      yield* Effect.logInfo('InjectionLogDelete completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogDelete', id, deleted: result }),
      )
      return result
    })

    const InjectionLogGetDrugs = Effect.fn('rpc.injection.getDrugs')(function* () {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('InjectionLogGetDrugs called').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGetDrugs', userId: user.id }),
      )
      const result = yield* repo.getUniqueDrugs(user.id)
      yield* Effect.logDebug('InjectionLogGetDrugs completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGetDrugs', count: result.length }),
      )
      return result
    })

    const InjectionLogGetSites = Effect.fn('rpc.injection.getSites')(function* () {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('InjectionLogGetSites called').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGetSites', userId: user.id }),
      )
      const result = yield* repo.getUniqueSites(user.id)
      yield* Effect.logDebug('InjectionLogGetSites completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGetSites', count: result.length }),
      )
      return result
    })

    const InjectionLogGetLastSite = Effect.fn('rpc.injection.getLastSite')(function* () {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('InjectionLogGetLastSite called').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGetLastSite', userId: user.id }),
      )
      const result = yield* repo.getLastSite(user.id)
      yield* Effect.logDebug('InjectionLogGetLastSite completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGetLastSite', site: result ?? 'none' }),
      )
      return result
    })

    const InjectionLogBulkAssignSchedule = Effect.fn('rpc.injection.bulkAssignSchedule')(function* (
      data: InjectionLogBulkAssignSchedule,
    ) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('InjectionLogBulkAssignSchedule called').pipe(
        Effect.annotateLogs({
          rpc: 'InjectionLogBulkAssignSchedule',
          userId: user.id,
          idsCount: data.ids.length,
          scheduleId: data.scheduleId ?? 'null',
        }),
      )
      const result = yield* repo.bulkAssignSchedule(data, user.id)
      yield* Effect.logInfo('InjectionLogBulkAssignSchedule completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogBulkAssignSchedule', updated: result }),
      )
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
