import * as HttpServerRequest from '@effect/platform/HttpServerRequest'
import * as NodeHttpServerRequest from '@effect/platform-node/NodeHttpServerRequest'
import {
  AppRpcs,
  type DashboardStatsParams,
  type InjectionLogCreate,
  type StatsParams,
  type WeightLogCreate,
} from '@scale/shared'
import { Effect, Layer, Option } from 'effect'
import { AuthService } from './auth/index.js'
import { Greeter } from './Greeter.js'
import { InjectionLogRepo } from './repositories/InjectionLogRepo.js'
import { WeightLogRepo } from './repositories/WeightLogRepo.js'
import { StatsService } from './services/StatsService.js'

// Helper to get authenticated user ID from request
const getAuthUserId = (auth: {
  api: { getSession: (opts: { headers: Record<string, string> }) => Promise<{ user?: { id: string } } | null> }
}) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const nodeRequest = NodeHttpServerRequest.toIncomingMessage(request)

    const session = yield* Effect.promise(() =>
      auth.api.getSession({
        headers: nodeRequest.headers as Record<string, string>,
      }),
    )

    if (!session?.user) {
      return yield* Effect.die(new Error('Not authenticated'))
    }

    return session.user.id
  })

export const RpcHandlersLive = AppRpcs.toLayer(
  Effect.gen(function* () {
    const greeter = yield* Greeter
    const weightLogRepo = yield* WeightLogRepo
    const injectionLogRepo = yield* InjectionLogRepo
    const statsService = yield* StatsService
    const { auth } = yield* AuthService

    return {
      // Existing
      Greet: ({ name }: { name: string }) => greeter.greet(name),

      // Weight Log handlers
      WeightLogList: (params: Parameters<typeof weightLogRepo.list>[0]) => weightLogRepo.list(params),
      WeightLogGet: ({ id }: { id: string }) => weightLogRepo.findById(id).pipe(Effect.map(Option.getOrNull)),
      WeightLogCreate: (data: WeightLogCreate) =>
        Effect.gen(function* () {
          const userId = yield* getAuthUserId(auth)
          return yield* weightLogRepo.create(data, userId)
        }),
      WeightLogUpdate: (data: Parameters<typeof weightLogRepo.update>[0]) => weightLogRepo.update(data),
      WeightLogDelete: ({ id }: { id: string }) => weightLogRepo.delete(id),

      // Injection Log handlers
      InjectionLogList: (params: Parameters<typeof injectionLogRepo.list>[0]) => injectionLogRepo.list(params),
      InjectionLogGet: ({ id }: { id: string }) => injectionLogRepo.findById(id).pipe(Effect.map(Option.getOrNull)),
      InjectionLogCreate: (data: InjectionLogCreate) =>
        Effect.gen(function* () {
          const userId = yield* getAuthUserId(auth)
          return yield* injectionLogRepo.create(data, userId)
        }),
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
      GetInjectionByDayOfWeek: (params: StatsParams) => statsService.getInjectionByDayOfWeek(params),
    }
  }),
).pipe(Layer.provide(Greeter.layer))
