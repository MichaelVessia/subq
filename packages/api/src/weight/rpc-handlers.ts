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
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* repo.list(params, user.id)
      yield* Effect.annotateCurrentSpan('count', result.length)
      return result
    })

    const WeightLogGet = Effect.fn('rpc.weight.get')(function* ({ id }: { id: string }) {
      yield* Effect.annotateCurrentSpan('id', id)
      const result = yield* repo.findById(id).pipe(Effect.map(Option.getOrNull))
      yield* Effect.annotateCurrentSpan('found', !!result)
      return result
    })

    const WeightLogCreate = Effect.fn('rpc.weight.create')(function* (data: WeightLogCreate) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      yield* Effect.annotateCurrentSpan('weight', data.weight)
      const result = yield* repo.create(data, user.id)
      yield* Effect.annotateCurrentSpan('resultId', result.id)
      return result
    })

    const WeightLogUpdate = Effect.fn('rpc.weight.update')(function* (data: WeightLogUpdate) {
      yield* Effect.annotateCurrentSpan('id', data.id)
      const result = yield* repo.update(data)
      return result
    })

    const WeightLogDelete = Effect.fn('rpc.weight.delete')(function* ({ id }: { id: string }) {
      yield* Effect.annotateCurrentSpan('id', id)
      const result = yield* repo.delete(id)
      yield* Effect.annotateCurrentSpan('success', result)
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
