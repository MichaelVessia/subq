import { AppRpcs, type DashboardStatsParams, type StatsParams } from '@scale/shared'
import { Effect, Layer, Option } from 'effect'
import { Greeter } from './Greeter.js'
import { WeightLogRepo } from './repositories/WeightLogRepo.js'
import { InjectionLogRepo } from './repositories/InjectionLogRepo.js'
import { StatsService } from './services/StatsService.js'

export const RpcHandlersLive = AppRpcs.toLayer(
  Effect.gen(function* () {
    const greeter = yield* Greeter
    const weightLogRepo = yield* WeightLogRepo
    const injectionLogRepo = yield* InjectionLogRepo
    const statsService = yield* StatsService

    return {
      // Existing
      Greet: ({ name }: { name: string }) => greeter.greet(name),

      // Weight Log handlers
      WeightLogList: (params: Parameters<typeof weightLogRepo.list>[0]) => weightLogRepo.list(params),
      WeightLogGet: ({ id }: { id: string }) => weightLogRepo.findById(id).pipe(Effect.map(Option.getOrNull)),
      WeightLogCreate: (data: Parameters<typeof weightLogRepo.create>[0]) => weightLogRepo.create(data),
      WeightLogUpdate: (data: Parameters<typeof weightLogRepo.update>[0]) => weightLogRepo.update(data),
      WeightLogDelete: ({ id }: { id: string }) => weightLogRepo.delete(id),

      // Injection Log handlers
      InjectionLogList: (params: Parameters<typeof injectionLogRepo.list>[0]) => injectionLogRepo.list(params),
      InjectionLogGet: ({ id }: { id: string }) => injectionLogRepo.findById(id).pipe(Effect.map(Option.getOrNull)),
      InjectionLogCreate: (data: Parameters<typeof injectionLogRepo.create>[0]) => injectionLogRepo.create(data),
      InjectionLogUpdate: (data: Parameters<typeof injectionLogRepo.update>[0]) => injectionLogRepo.update(data),
      InjectionLogDelete: ({ id }: { id: string }) => injectionLogRepo.delete(id),
      InjectionLogGetDrugs: () => injectionLogRepo.getUniqueDrugs(),
      InjectionLogGetSites: () => injectionLogRepo.getUniqueSites(),

      // Dashboard stats
      GetDashboardStats: (params: DashboardStatsParams) => statsService.getDashboardStats(params),

      // Stats page endpoints
      GetWeightStats: (params: StatsParams) => statsService.getWeightStats(params),
      GetWeightTrend: (params: StatsParams) => statsService.getWeightTrend(params),
      GetInjectionSiteStats: (params: StatsParams) => statsService.getInjectionSiteStats(params),
      GetDosageHistory: (params: StatsParams) => statsService.getDosageHistory(params),
      GetInjectionFrequency: (params: StatsParams) => statsService.getInjectionFrequency(params),
      GetDrugBreakdown: (params: StatsParams) => statsService.getDrugBreakdown(params),
    }
  }),
).pipe(Layer.provide(Greeter.layer))
