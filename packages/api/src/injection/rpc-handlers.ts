import {
  AuthContext,
  type InjectionLogBulkAssignSchedule,
  type InjectionLogCreate,
  type InjectionLogListParams,
  InjectionRpcs,
} from '@scale/shared'
import { Effect, Option } from 'effect'
import { InjectionLogRepo } from './injection-log-repo.js'

export const InjectionRpcHandlersLive = InjectionRpcs.toLayer(
  Effect.gen(function* () {
    yield* Effect.logInfo('Initializing injection RPC handlers...')
    const injectionLogRepo = yield* InjectionLogRepo

    return {
      InjectionLogList: (params: InjectionLogListParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('InjectionLogList called', { userId: user.id, params })
          const result = yield* injectionLogRepo.list(params, user.id)
          yield* Effect.logInfo('InjectionLogList completed', { count: result.length, userId: user.id })
          return result
        }),
      InjectionLogGet: ({ id }: { id: string }) =>
        Effect.gen(function* () {
          yield* Effect.logDebug('InjectionLogGet called', { id })
          const result = yield* injectionLogRepo.findById(id).pipe(Effect.map(Option.getOrNull))
          yield* Effect.logInfo('InjectionLogGet completed', { id, found: !!result })
          return result
        }),
      InjectionLogCreate: (data: InjectionLogCreate) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logInfo('InjectionLogCreate called', {
            userId: user.id,
            drug: data.drug,
            site: data.injectionSite,
          })
          const result = yield* injectionLogRepo.create(data, user.id)
          yield* Effect.logInfo('InjectionLogCreate completed', { id: result.id, userId: user.id })
          return result
        }),
      InjectionLogUpdate: (data: Parameters<typeof injectionLogRepo.update>[0]) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('InjectionLogUpdate called', { id: data.id })
          const result = yield* injectionLogRepo.update(data)
          yield* Effect.logInfo('InjectionLogUpdate completed', { id: result.id })
          return result
        }),
      InjectionLogDelete: ({ id }: { id: string }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('InjectionLogDelete called', { id })
          const result = yield* injectionLogRepo.delete(id)
          yield* Effect.logInfo('InjectionLogDelete completed', { id, success: result })
          return result
        }),
      InjectionLogGetDrugs: () =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('InjectionLogGetDrugs called', { userId: user.id })
          const result = yield* injectionLogRepo.getUniqueDrugs(user.id)
          yield* Effect.logInfo('InjectionLogGetDrugs completed', { userId: user.id, count: result.length })
          return result
        }),
      InjectionLogGetSites: () =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('InjectionLogGetSites called', { userId: user.id })
          const result = yield* injectionLogRepo.getUniqueSites(user.id)
          yield* Effect.logInfo('InjectionLogGetSites completed', { userId: user.id, count: result.length })
          return result
        }),
      InjectionLogGetLastSite: () =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('InjectionLogGetLastSite called', { userId: user.id })
          const result = yield* injectionLogRepo.getLastSite(user.id)
          yield* Effect.logInfo('InjectionLogGetLastSite completed', { userId: user.id, site: result })
          return result
        }),
      InjectionLogBulkAssignSchedule: (data: InjectionLogBulkAssignSchedule) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logInfo('InjectionLogBulkAssignSchedule called', {
            userId: user.id,
            count: data.ids.length,
            scheduleId: data.scheduleId,
          })
          const result = yield* injectionLogRepo.bulkAssignSchedule(data, user.id)
          yield* Effect.logInfo('InjectionLogBulkAssignSchedule completed', { userId: user.id, updated: result })
          return result
        }),
    }
  }).pipe(Effect.tap(() => Effect.logInfo('Injection RPC handlers initialized'))),
)
