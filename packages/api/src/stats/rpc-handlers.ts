import { AuthContext, type StatsParams, StatsRpcs } from '@subq/shared'
import { Effect } from 'effect'
import { StatsService } from './stats-service.js'

export const StatsRpcHandlersLive = StatsRpcs.toLayer(
  Effect.gen(function* () {
    const service = yield* StatsService

    const GetWeightStats = Effect.fn('rpc.stats.getWeightStats')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* service.getWeightStats(params, user.id)
      yield* Effect.annotateCurrentSpan('hasData', !!result)
      return result
    })

    const GetWeightTrend = Effect.fn('rpc.stats.getWeightTrend')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* service.getWeightTrend(params, user.id)
      yield* Effect.annotateCurrentSpan('hasData', !!result)
      return result
    })

    const GetInjectionSiteStats = Effect.fn('rpc.stats.getInjectionSiteStats')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* service.getInjectionSiteStats(params, user.id)
      yield* Effect.annotateCurrentSpan('hasData', !!result)
      return result
    })

    const GetDosageHistory = Effect.fn('rpc.stats.getDosageHistory')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* service.getDosageHistory(params, user.id)
      yield* Effect.annotateCurrentSpan('hasData', !!result)
      return result
    })

    const GetInjectionFrequency = Effect.fn('rpc.stats.getInjectionFrequency')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* service.getInjectionFrequency(params, user.id)
      yield* Effect.annotateCurrentSpan('hasData', !!result)
      return result
    })

    const GetDrugBreakdown = Effect.fn('rpc.stats.getDrugBreakdown')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* service.getDrugBreakdown(params, user.id)
      yield* Effect.annotateCurrentSpan('hasData', !!result)
      return result
    })

    const GetInjectionByDayOfWeek = Effect.fn('rpc.stats.getInjectionByDayOfWeek')(function* (params: StatsParams) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* service.getInjectionByDayOfWeek(params, user.id)
      yield* Effect.annotateCurrentSpan('hasData', !!result)
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
