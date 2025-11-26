import {
  AppRpcs,
  AuthContext,
  type DashboardStatsParams,
  type InjectionLogCreate,
  type StatsParams,
  type WeightLogCreate,
} from '@scale/shared'
import { Effect, Option } from 'effect'
import { InjectionLogRepo } from './repositories/InjectionLogRepo.js'
import { WeightLogRepo } from './repositories/WeightLogRepo.js'
import { StatsService } from './services/StatsService.js'

export const RpcHandlersLive = AppRpcs.toLayer(
  Effect.gen(function* () {
    const weightLogRepo = yield* WeightLogRepo
    const injectionLogRepo = yield* InjectionLogRepo
    const statsService = yield* StatsService

    return {
      // Weight Log handlers
      WeightLogList: (params: Parameters<typeof weightLogRepo.list>[0]) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* weightLogRepo.list(params, user.id)
        }),
      WeightLogGet: ({ id }: { id: string }) => weightLogRepo.findById(id).pipe(Effect.map(Option.getOrNull)),
      WeightLogCreate: (data: WeightLogCreate) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* weightLogRepo.create(data, user.id)
        }),
      WeightLogUpdate: (data: Parameters<typeof weightLogRepo.update>[0]) => weightLogRepo.update(data),
      WeightLogDelete: ({ id }: { id: string }) => weightLogRepo.delete(id),

      // Injection Log handlers
      InjectionLogList: (params: Parameters<typeof injectionLogRepo.list>[0]) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* injectionLogRepo.list(params, user.id)
        }),
      InjectionLogGet: ({ id }: { id: string }) => injectionLogRepo.findById(id).pipe(Effect.map(Option.getOrNull)),
      InjectionLogCreate: (data: InjectionLogCreate) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* injectionLogRepo.create(data, user.id)
        }),
      InjectionLogUpdate: (data: Parameters<typeof injectionLogRepo.update>[0]) => injectionLogRepo.update(data),
      InjectionLogDelete: ({ id }: { id: string }) => injectionLogRepo.delete(id),
      InjectionLogGetDrugs: () =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* injectionLogRepo.getUniqueDrugs(user.id)
        }),
      InjectionLogGetSites: () =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          return yield* injectionLogRepo.getUniqueSites(user.id)
        }),

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
