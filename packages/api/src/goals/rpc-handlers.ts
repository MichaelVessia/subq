import {
  AuthContext,
  type GoalId,
  GoalRpcs,
  NoWeightDataError,
  type UserGoalCreate,
  UserGoalUpdate,
  Weight,
} from '@subq/shared'
import { Effect, Option } from 'effect'
import { GoalRepo } from './goal-repo.js'
import { GoalService } from './goal-service.js'

export const GoalRpcHandlersLive = GoalRpcs.toLayer(
  Effect.gen(function* () {
    const goalRepo = yield* GoalRepo
    const goalService = yield* GoalService

    const GoalGetActive = Effect.fn('rpc.goal.getActive')(function* () {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('GoalGetActive called').pipe(
        Effect.annotateLogs({ rpc: 'GoalGetActive', userId: user.id }),
      )
      const result = yield* goalRepo.getActive(user.id).pipe(Effect.map(Option.getOrNull))
      yield* Effect.logDebug('GoalGetActive completed').pipe(
        Effect.annotateLogs({ rpc: 'GoalGetActive', found: !!result, goalId: result?.id ?? 'none' }),
      )
      return result
    })

    const GoalGet = Effect.fn('rpc.goal.get')(function* ({ id }: { id: GoalId }) {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('GoalGet called').pipe(Effect.annotateLogs({ rpc: 'GoalGet', id }))
      const result = yield* goalRepo.findById(id, user.id).pipe(Effect.map(Option.getOrNull))
      yield* Effect.logDebug('GoalGet completed').pipe(Effect.annotateLogs({ rpc: 'GoalGet', id, found: !!result }))
      return result
    })

    const GoalList = Effect.fn('rpc.goal.list')(function* () {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('GoalList called').pipe(Effect.annotateLogs({ rpc: 'GoalList', userId: user.id }))
      const result = yield* goalRepo.list(user.id)
      yield* Effect.logDebug('GoalList completed').pipe(Effect.annotateLogs({ rpc: 'GoalList', count: result.length }))
      return result
    })

    const GoalCreate = Effect.fn('rpc.goal.create')(function* (data: UserGoalCreate) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('GoalCreate called').pipe(
        Effect.annotateLogs({
          rpc: 'GoalCreate',
          userId: user.id,
          goalWeight: data.goalWeight,
        }),
      )

      // Get starting weight - use provided, or lookup at startingDate, or fetch most recent
      let startingWeight: number
      if (data.startingWeight !== undefined) {
        startingWeight = data.startingWeight
      } else if (Option.isSome(data.startingDate)) {
        const weightOpt = yield* goalService.getWeightAtDate(user.id, data.startingDate.value)
        if (Option.isNone(weightOpt)) {
          return yield* NoWeightDataError.make({})
        }
        startingWeight = weightOpt.value
      } else {
        const weightOpt = yield* goalService.getMostRecentWeight(user.id)
        if (Option.isNone(weightOpt)) {
          return yield* NoWeightDataError.make({})
        }
        startingWeight = weightOpt.value
      }

      const result = yield* goalRepo.create(data, startingWeight, user.id)
      yield* Effect.logInfo('GoalCreate completed').pipe(
        Effect.annotateLogs({ rpc: 'GoalCreate', id: result.id, goalWeight: result.goalWeight }),
      )
      return result
    })

    const GoalUpdate = Effect.fn('rpc.goal.update')(function* (data: UserGoalUpdate) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('GoalUpdate called').pipe(
        Effect.annotateLogs({ rpc: 'GoalUpdate', id: data.id, isActive: data.isActive }),
      )

      // If startingDate changed and no explicit startingWeight, lookup weight at new date
      let updateData = data
      if (data.startingDate !== undefined && data.startingWeight === undefined) {
        const weightOpt = yield* goalService.getWeightAtDate(user.id, data.startingDate)
        if (Option.isSome(weightOpt)) {
          updateData = new UserGoalUpdate({ ...data, startingWeight: Weight.make(weightOpt.value) })
        }
      }

      const result = yield* goalRepo.update(updateData, user.id)
      yield* Effect.logInfo('GoalUpdate completed').pipe(Effect.annotateLogs({ rpc: 'GoalUpdate', id: data.id }))
      return result
    })

    const GoalDelete = Effect.fn('rpc.goal.delete')(function* ({ id }: { id: GoalId }) {
      const { user } = yield* AuthContext
      yield* Effect.logInfo('GoalDelete called').pipe(Effect.annotateLogs({ rpc: 'GoalDelete', id }))
      const result = yield* goalRepo.delete(id, user.id)
      yield* Effect.logInfo('GoalDelete completed').pipe(
        Effect.annotateLogs({ rpc: 'GoalDelete', id, deleted: result }),
      )
      return result
    })

    const GoalGetProgress = Effect.fn('rpc.goal.getProgress')(function* () {
      const { user } = yield* AuthContext
      yield* Effect.logDebug('GoalGetProgress called').pipe(
        Effect.annotateLogs({ rpc: 'GoalGetProgress', userId: user.id }),
      )
      const result = yield* goalService.getGoalProgress(user.id)
      yield* Effect.logDebug('GoalGetProgress completed').pipe(
        Effect.annotateLogs({
          rpc: 'GoalGetProgress',
          found: !!result,
          percentComplete: result?.percentComplete ?? 'none',
        }),
      )
      return result
    })

    return {
      GoalGetActive,
      GoalGet,
      GoalList,
      GoalCreate,
      GoalUpdate,
      GoalDelete,
      GoalGetProgress,
    }
  }),
)
