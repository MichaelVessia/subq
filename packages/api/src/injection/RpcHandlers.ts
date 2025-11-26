import { AuthContext, type InjectionLogCreate, InjectionRpcs, type InjectionLogListParams } from '@scale/shared'
import { Effect, Option } from 'effect'
import { InjectionLogRepo } from './InjectionLogRepo.js'

export const InjectionRpcHandlersLive = InjectionRpcs.toLayer(
  Effect.gen(function* () {
    const injectionLogRepo = yield* InjectionLogRepo

    return {
      InjectionLogList: (params: InjectionLogListParams) =>
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
    }
  }),
)
