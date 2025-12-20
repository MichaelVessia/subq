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
      yield* Effect.logDebug('InventoryList called').pipe(
        Effect.annotateLogs({
          rpc: 'InventoryList',
          userId: user.id,
          status: params.status ?? 'all',
          drug: params.drug ?? 'all',
        }),
      )
      const result = yield* repo.list(params, user.id)
      yield* Effect.logDebug('InventoryList completed').pipe(
        Effect.annotateLogs({ rpc: 'InventoryList', count: result.length }),
      )
      return result
    })

    const InventoryGet = Effect.fn('rpc.inventory.get')(function* ({ id }: { id: string }) {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('InventoryGet called').pipe(Effect.annotateLogs({ rpc: 'InventoryGet', id }))
      const result = yield* repo.findById(id, user.id).pipe(Effect.map(Option.getOrNull))
      yield* Effect.logDebug('InventoryGet completed').pipe(
        Effect.annotateLogs({ rpc: 'InventoryGet', id, found: !!result }),
      )
      return result
    })

    const InventoryCreate = Effect.fn('rpc.inventory.create')(function* (data: InventoryCreate) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('InventoryCreate called').pipe(
        Effect.annotateLogs({
          rpc: 'InventoryCreate',
          userId: user.id,
          drug: data.drug,
          source: data.source,
          form: data.form,
          status: data.status,
        }),
      )
      const result = yield* repo.create(data, user.id)
      yield* Effect.logInfo('InventoryCreate completed').pipe(
        Effect.annotateLogs({ rpc: 'InventoryCreate', id: result.id }),
      )
      return result
    })

    const InventoryUpdate = Effect.fn('rpc.inventory.update')(function* (data: InventoryUpdate) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('InventoryUpdate called').pipe(Effect.annotateLogs({ rpc: 'InventoryUpdate', id: data.id }))
      const result = yield* repo.update(data, user.id)
      yield* Effect.logInfo('InventoryUpdate completed').pipe(
        Effect.annotateLogs({ rpc: 'InventoryUpdate', id: result.id }),
      )
      return result
    })

    const InventoryDelete = Effect.fn('rpc.inventory.delete')(function* ({ id }: { id: string }) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('InventoryDelete called').pipe(Effect.annotateLogs({ rpc: 'InventoryDelete', id }))
      const result = yield* repo.delete(id, user.id)
      yield* Effect.logInfo('InventoryDelete completed').pipe(
        Effect.annotateLogs({ rpc: 'InventoryDelete', id, deleted: result }),
      )
      return result
    })

    const InventoryMarkFinished = Effect.fn('rpc.inventory.markFinished')(function* ({ id }: InventoryMarkFinished) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('InventoryMarkFinished called').pipe(
        Effect.annotateLogs({ rpc: 'InventoryMarkFinished', id }),
      )
      const result = yield* repo.markFinished(id, user.id)
      yield* Effect.logInfo('InventoryMarkFinished completed').pipe(
        Effect.annotateLogs({ rpc: 'InventoryMarkFinished', id }),
      )
      return result
    })

    const InventoryMarkOpened = Effect.fn('rpc.inventory.markOpened')(function* ({ id }: InventoryMarkOpened) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('InventoryMarkOpened called').pipe(Effect.annotateLogs({ rpc: 'InventoryMarkOpened', id }))
      const result = yield* repo.markOpened(id, user.id)
      yield* Effect.logInfo('InventoryMarkOpened completed').pipe(
        Effect.annotateLogs({ rpc: 'InventoryMarkOpened', id }),
      )
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
