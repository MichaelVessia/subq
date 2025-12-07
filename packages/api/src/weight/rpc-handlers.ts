import {
  AuthContext,
  type WeightLogCreate,
  type WeightLogUpdate,
  WeightRpcs,
  type WeightLogListParams,
} from '@subq/shared'
import { Effect, Option } from 'effect'
import { WeightLogRepo } from './weight-log-repo.js'

export const WeightRpcHandlersLive = WeightRpcs.toLayer(
  Effect.gen(function* () {
    const repo = yield* WeightLogRepo

    const WeightLogList = Effect.fn('rpc.weight.list')(function* (params: WeightLogListParams) {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('WeightLogList called').pipe(
        Effect.annotateLogs({
          rpc: 'WeightLogList',
          userId: user.id,
          startDate: params.startDate?.toISOString() ?? 'none',
          endDate: params.endDate?.toISOString() ?? 'none',
        }),
      )
      const result = yield* repo.list(params, user.id)
      yield* Effect.logDebug('WeightLogList completed').pipe(
        Effect.annotateLogs({ rpc: 'WeightLogList', count: result.length }),
      )
      return result
    })

    const WeightLogGet = Effect.fn('rpc.weight.get')(function* ({ id }: { id: string }) {
      yield* Effect.logDebug('WeightLogGet called').pipe(Effect.annotateLogs({ rpc: 'WeightLogGet', id }))
      const result = yield* repo.findById(id).pipe(Effect.map(Option.getOrNull))
      yield* Effect.logDebug('WeightLogGet completed').pipe(
        Effect.annotateLogs({ rpc: 'WeightLogGet', id, found: !!result }),
      )
      return result
    })

    const WeightLogCreate = Effect.fn('rpc.weight.create')(function* (data: WeightLogCreate) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('WeightLogCreate called').pipe(
        Effect.annotateLogs({
          rpc: 'WeightLogCreate',
          userId: user.id,
          weight: data.weight,
          unit: data.unit,
        }),
      )
      const weightLog = yield* repo.create(data, user.id)

      yield* Effect.logInfo('WeightLogCreate completed').pipe(
        Effect.annotateLogs({ rpc: 'WeightLogCreate', id: weightLog.id }),
      )
      return weightLog
    })

    const WeightLogUpdate = Effect.fn('rpc.weight.update')(function* (data: WeightLogUpdate) {
      yield* Effect.logInfo('WeightLogUpdate called').pipe(Effect.annotateLogs({ rpc: 'WeightLogUpdate', id: data.id }))
      const result = yield* repo.update(data)
      yield* Effect.logInfo('WeightLogUpdate completed').pipe(
        Effect.annotateLogs({ rpc: 'WeightLogUpdate', id: result.id }),
      )
      return result
    })

    const WeightLogDelete = Effect.fn('rpc.weight.delete')(function* ({ id }: { id: string }) {
      yield* Effect.logInfo('WeightLogDelete called').pipe(Effect.annotateLogs({ rpc: 'WeightLogDelete', id }))
      const result = yield* repo.delete(id)
      yield* Effect.logInfo('WeightLogDelete completed').pipe(
        Effect.annotateLogs({ rpc: 'WeightLogDelete', id, deleted: result }),
      )
      return result
    })

    return {
      WeightLogList,
      WeightLogGet,
      WeightLogCreate,
      WeightLogUpdate,
      WeightLogDelete,
    }
  }),
)
