import { AuthContext, type WeightLogCreate, WeightRpcs, type WeightLogListParams } from '@scale/shared'
import { Effect, Option } from 'effect'
import { WeightLogRepo } from './WeightLogRepo.js'

export const WeightRpcHandlersLive = WeightRpcs.toLayer(
  Effect.gen(function* () {
    const weightLogRepo = yield* WeightLogRepo

    return {
      WeightLogList: (params: WeightLogListParams) =>
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
    }
  }),
)
