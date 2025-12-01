import { AuthContext, type StatsParams, StatsRpcs } from '@subq/shared'
import { Effect } from 'effect'
import { StatsService } from './stats-service.js'

export const StatsRpcHandlersLive = StatsRpcs.toLayer(
  Effect.gen(function* () {
    const service = yield* StatsService

    const GetWeightStats = Effect.fn('rpc.stats.getWeightStats')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('GetWeightStats called').pipe(
        Effect.annotateLogs({
          rpc: 'GetWeightStats',
          userId: user.id,
          startDate: params.startDate?.toISOString() ?? 'none',
          endDate: params.endDate?.toISOString() ?? 'none',
        }),
      )
      const result = yield* service.getWeightStats(params, user.id)
      yield* Effect.logDebug('GetWeightStats completed').pipe(
        Effect.annotateLogs({ rpc: 'GetWeightStats', hasData: !!result }),
      )
      return result
    })

    const GetWeightTrend = Effect.fn('rpc.stats.getWeightTrend')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('GetWeightTrend called').pipe(
        Effect.annotateLogs({ rpc: 'GetWeightTrend', userId: user.id }),
      )
      const result = yield* service.getWeightTrend(params, user.id)
      yield* Effect.logDebug('GetWeightTrend completed').pipe(
        Effect.annotateLogs({ rpc: 'GetWeightTrend', points: result?.points.length ?? 0 }),
      )
      return result
    })

    const GetInjectionSiteStats = Effect.fn('rpc.stats.getInjectionSiteStats')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('GetInjectionSiteStats called').pipe(
        Effect.annotateLogs({ rpc: 'GetInjectionSiteStats', userId: user.id }),
      )
      const result = yield* service.getInjectionSiteStats(params, user.id)
      yield* Effect.logDebug('GetInjectionSiteStats completed').pipe(
        Effect.annotateLogs({ rpc: 'GetInjectionSiteStats', sitesCount: result?.sites.length ?? 0 }),
      )
      return result
    })

    const GetDosageHistory = Effect.fn('rpc.stats.getDosageHistory')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('GetDosageHistory called').pipe(
        Effect.annotateLogs({ rpc: 'GetDosageHistory', userId: user.id }),
      )
      const result = yield* service.getDosageHistory(params, user.id)
      yield* Effect.logDebug('GetDosageHistory completed').pipe(
        Effect.annotateLogs({ rpc: 'GetDosageHistory', points: result?.points.length ?? 0 }),
      )
      return result
    })

    const GetInjectionFrequency = Effect.fn('rpc.stats.getInjectionFrequency')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('GetInjectionFrequency called').pipe(
        Effect.annotateLogs({ rpc: 'GetInjectionFrequency', userId: user.id }),
      )
      const result = yield* service.getInjectionFrequency(params, user.id)
      yield* Effect.logDebug('GetInjectionFrequency completed').pipe(
        Effect.annotateLogs({ rpc: 'GetInjectionFrequency', hasData: !!result }),
      )
      return result
    })

    const GetDrugBreakdown = Effect.fn('rpc.stats.getDrugBreakdown')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('GetDrugBreakdown called').pipe(
        Effect.annotateLogs({ rpc: 'GetDrugBreakdown', userId: user.id }),
      )
      const result = yield* service.getDrugBreakdown(params, user.id)
      yield* Effect.logDebug('GetDrugBreakdown completed').pipe(
        Effect.annotateLogs({ rpc: 'GetDrugBreakdown', drugsCount: result?.drugs.length ?? 0 }),
      )
      return result
    })

    const GetInjectionByDayOfWeek = Effect.fn('rpc.stats.getInjectionByDayOfWeek')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('GetInjectionByDayOfWeek called').pipe(
        Effect.annotateLogs({ rpc: 'GetInjectionByDayOfWeek', userId: user.id }),
      )
      const result = yield* service.getInjectionByDayOfWeek(params, user.id)
      yield* Effect.logDebug('GetInjectionByDayOfWeek completed').pipe(
        Effect.annotateLogs({ rpc: 'GetInjectionByDayOfWeek', hasData: !!result }),
      )
      return result
    })

    return {
      GetWeightStats,
      GetWeightTrend,
      GetInjectionSiteStats,
      GetDosageHistory,
      GetInjectionFrequency,
      GetDrugBreakdown,
      GetInjectionByDayOfWeek,
    }
  }),
)
