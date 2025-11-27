import {
  AuthContext,
  type InventoryCreate,
  type InventoryListParams,
  type InventoryMarkFinished,
  type InventoryMarkOpened,
  InventoryRpcs,
} from '@subq/shared'
import { Effect, Option } from 'effect'
import { InventoryRepo } from './inventory-repo.js'

export const InventoryRpcHandlersLive = InventoryRpcs.toLayer(
  Effect.gen(function* () {
    yield* Effect.logInfo('Initializing inventory RPC handlers...')
    const inventoryRepo = yield* InventoryRepo

    return {
      InventoryList: (params: InventoryListParams) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('InventoryList called', { userId: user.id, params })
          const result = yield* inventoryRepo.list(params, user.id)
          yield* Effect.logInfo('InventoryList completed', { count: result.length, userId: user.id })
          return result
        }),

      InventoryGet: ({ id }: { id: string }) =>
        Effect.gen(function* () {
          yield* Effect.logDebug('InventoryGet called', { id })
          const result = yield* inventoryRepo.findById(id).pipe(Effect.map(Option.getOrNull))
          yield* Effect.logInfo('InventoryGet completed', { id, found: !!result })
          return result
        }),

      InventoryCreate: (data: InventoryCreate) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logInfo('InventoryCreate called', {
            userId: user.id,
            drug: data.drug,
            form: data.form,
          })
          const result = yield* inventoryRepo.create(data, user.id)
          yield* Effect.logInfo('InventoryCreate completed', { id: result.id, userId: user.id })
          return result
        }),

      InventoryUpdate: (data: Parameters<typeof inventoryRepo.update>[0]) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('InventoryUpdate called', { id: data.id })
          const result = yield* inventoryRepo.update(data)
          yield* Effect.logInfo('InventoryUpdate completed', { id: result.id })
          return result
        }),

      InventoryDelete: ({ id }: { id: string }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('InventoryDelete called', { id })
          const result = yield* inventoryRepo.delete(id)
          yield* Effect.logInfo('InventoryDelete completed', { id, success: result })
          return result
        }),

      InventoryMarkFinished: ({ id }: InventoryMarkFinished) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('InventoryMarkFinished called', { id })
          const result = yield* inventoryRepo.markFinished(id)
          yield* Effect.logInfo('InventoryMarkFinished completed', { id })
          return result
        }),

      InventoryMarkOpened: ({ id }: InventoryMarkOpened) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('InventoryMarkOpened called', { id })
          const result = yield* inventoryRepo.markOpened(id)
          yield* Effect.logInfo('InventoryMarkOpened completed', { id })
          return result
        }),
    }
  }).pipe(Effect.tap(() => Effect.logInfo('Inventory RPC handlers initialized'))),
)
