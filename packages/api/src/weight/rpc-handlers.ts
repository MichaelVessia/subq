import { AuthContext, type WeightLogCreate, WeightRpcs, type WeightLogListParams } from '@scale/shared'
import { Effect, Option } from 'effect'
import { WeightLogRepo } from './weight-log-repo.js'

export const WeightRpcHandlersLive = WeightRpcs.toLayer(
  Effect.gen(function* () {
    yield* Effect.logInfo('Initializing weight RPC handlers...')
    const weightLogRepo = yield* WeightLogRepo

    return {
      WeightLogList: (params: WeightLogListParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('WeightLogList called', { userId: user.id, params })
          const result = yield* weightLogRepo.list(params, user.id)
          yield* Effect.logInfo('WeightLogList completed', { count: result.length, userId: user.id })
          return result
        }),
      WeightLogGet: ({ id }: { id: string }) =>
        Effect.gen(function* () {
          yield* Effect.logDebug('WeightLogGet called', { id })
          const result = yield* weightLogRepo.findById(id).pipe(Effect.map(Option.getOrNull))
          yield* Effect.logInfo('WeightLogGet completed', { id, found: !!result })
          return result
        }),
      WeightLogCreate: (data: WeightLogCreate) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logInfo('WeightLogCreate called', { userId: user.id, weight: data.weight })
          const result = yield* weightLogRepo.create(data, user.id)
          yield* Effect.logInfo('WeightLogCreate completed', { id: result.id, userId: user.id })
          return result
        }),
      WeightLogUpdate: (data: Parameters<typeof weightLogRepo.update>[0]) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('WeightLogUpdate called', { id: data.id })
          const result = yield* weightLogRepo.update(data)
          yield* Effect.logInfo('WeightLogUpdate completed', { id: result.id })
          return result
        }),
      WeightLogDelete: ({ id }: { id: string }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('WeightLogDelete called', { id })
          const result = yield* weightLogRepo.delete(id)
          yield* Effect.logInfo('WeightLogDelete completed', { id, success: result })
          return result
        }),
    }
  }).pipe(Effect.tap(() => Effect.logInfo('Weight RPC handlers initialized'))),
)
