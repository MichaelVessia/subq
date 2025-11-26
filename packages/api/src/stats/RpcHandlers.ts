import { AuthContext, type DashboardStatsParams, type StatsParams, StatsRpcs } from '@scale/shared'
import { Effect } from 'effect'
import { StatsService } from './StatsService.js'

export const StatsRpcHandlersLive = StatsRpcs.toLayer(
  Effect.gen(function* () {
    const statsService = yield* StatsService

    return {
      // Dashboard stats
      GetDashboardStats: (params: DashboardStatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* statsService.getDashboardStats(params, user.id)
        }),

      // Stats page endpoints
      GetWeightStats: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* statsService.getWeightStats(params, user.id)
        }),
      GetWeightTrend: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* statsService.getWeightTrend(params, user.id)
        }),
      GetInjectionSiteStats: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* statsService.getInjectionSiteStats(params, user.id)
        }),
      GetDosageHistory: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* statsService.getDosageHistory(params, user.id)
        }),
      GetInjectionFrequency: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* statsService.getInjectionFrequency(params, user.id)
        }),
      GetDrugBreakdown: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* statsService.getDrugBreakdown(params, user.id)
        }),
      GetInjectionByDayOfWeek: (params: StatsParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* statsService.getInjectionByDayOfWeek(params, user.id)
        }),
    }
  }),
)
