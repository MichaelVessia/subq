import { AuthContext, type StatsParams, StatsRpcs } from '@scale/shared'
import { Effect } from 'effect'
import { StatsService } from './StatsService.js'

export const StatsRpcHandlersLive = StatsRpcs.toLayer(
  Effect.gen(function* () {
    yield* Effect.logInfo('Initializing stats RPC handlers...')
    const statsService = yield* StatsService

    return {
      GetWeightStats: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('GetWeightStats called', { userId: user.id, params })
          const result = yield* statsService.getWeightStats(params, user.id)
          yield* Effect.logInfo('GetWeightStats completed', { userId: user.id, hasData: !!result })
          return result
        }),
      GetWeightTrend: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('GetWeightTrend called', { userId: user.id, params })
          const result = yield* statsService.getWeightTrend(params, user.id)
          yield* Effect.logInfo('GetWeightTrend completed', { userId: user.id, hasData: !!result })
          return result
        }),
      GetInjectionSiteStats: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('GetInjectionSiteStats called', { userId: user.id, params })
          const result = yield* statsService.getInjectionSiteStats(params, user.id)
          yield* Effect.logInfo('GetInjectionSiteStats completed', { userId: user.id, hasData: !!result })
          return result
        }),
      GetDosageHistory: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('GetDosageHistory called', { userId: user.id, params })
          const result = yield* statsService.getDosageHistory(params, user.id)
          yield* Effect.logInfo('GetDosageHistory completed', { userId: user.id, hasData: !!result })
          return result
        }),
      GetInjectionFrequency: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('GetInjectionFrequency called', { userId: user.id, params })
          const result = yield* statsService.getInjectionFrequency(params, user.id)
          yield* Effect.logInfo('GetInjectionFrequency completed', { userId: user.id, hasData: !!result })
          return result
        }),
      GetDrugBreakdown: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('GetDrugBreakdown called', { userId: user.id, params })
          const result = yield* statsService.getDrugBreakdown(params, user.id)
          yield* Effect.logInfo('GetDrugBreakdown completed', { userId: user.id, hasData: !!result })
          return result
        }),
      GetInjectionByDayOfWeek: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('GetInjectionByDayOfWeek called', { userId: user.id, params })
          const result = yield* statsService.getInjectionByDayOfWeek(params, user.id)
          yield* Effect.logInfo('GetInjectionByDayOfWeek completed', { userId: user.id, hasData: !!result })
          return result
        }),
    }
  }).pipe(Effect.tap(() => Effect.logInfo('Stats RPC handlers initialized'))),
)
