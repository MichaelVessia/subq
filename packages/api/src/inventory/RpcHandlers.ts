import {
  AuthContext,
  type InventoryCreate,
  type InventoryListParams,
  type InventoryMarkFinished,
  type InventoryMarkOpened,
  type InventoryUpdate,
  InventoryRpcs,
} from '@subq/shared'
import { Effect, Option } from 'effect'
import { InventoryRepo } from './inventory-repo.js'

export const InventoryRpcHandlersLive = InventoryRpcs.toLayer(
  Effect.gen(function* () {
    const repo = yield* InventoryRepo

    const InventoryList = Effect.fn('rpc.inventory.list')(function* (params: InventoryListParams) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      const result = yield* repo.list(params, user.id)
      yield* Effect.annotateCurrentSpan('count', result.length)
      return result
    })

    const InventoryGet = Effect.fn('rpc.inventory.get')(function* ({ id }: { id: string }) {
      yield* Effect.annotateCurrentSpan('id', id)
      const result = yield* repo.findById(id).pipe(Effect.map(Option.getOrNull))
      yield* Effect.annotateCurrentSpan('found', !!result)
      return result
    })

    const InventoryCreate = Effect.fn('rpc.inventory.create')(function* (data: InventoryCreate) {
      const { user } = yield* AuthContext
      yield* Effect.annotateCurrentSpan('userId', user.id)
      yield* Effect.annotateCurrentSpan('drug', data.drug)
      yield* Effect.annotateCurrentSpan('form', data.form)
      const result = yield* repo.create(data, user.id)
      yield* Effect.annotateCurrentSpan('resultId', result.id)
      return result
    })

    const InventoryUpdate = Effect.fn('rpc.inventory.update')(function* (data: InventoryUpdate) {
      yield* Effect.annotateCurrentSpan('id', data.id)
      const result = yield* repo.update(data)
      return result
    })

    const InventoryDelete = Effect.fn('rpc.inventory.delete')(function* ({ id }: { id: string }) {
      yield* Effect.annotateCurrentSpan('id', id)
      const result = yield* repo.delete(id)
      yield* Effect.annotateCurrentSpan('success', result)
      return result
    })

    const InventoryMarkFinished = Effect.fn('rpc.inventory.markFinished')(function* ({ id }: InventoryMarkFinished) {
      yield* Effect.annotateCurrentSpan('id', id)
      const result = yield* repo.markFinished(id)
      return result
    })

    const InventoryMarkOpened = Effect.fn('rpc.inventory.markOpened')(function* ({ id }: InventoryMarkOpened) {
      yield* Effect.annotateCurrentSpan('id', id)
      const result = yield* repo.markOpened(id)
      return result
    })

    return {
      InventoryList,
      InventoryGet,
      InventoryCreate,
      InventoryUpdate,
      InventoryDelete,
      InventoryMarkFinished,
      InventoryMarkOpened,
    }
  }),
)
