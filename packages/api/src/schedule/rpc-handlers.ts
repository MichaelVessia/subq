import {
  AuthContext,
  type InjectionScheduleCreate,
  type InjectionScheduleId,
  type InjectionScheduleUpdate,
  ScheduleRpcs,
} from '@subq/shared'
import { Effect, Option } from 'effect'
import { ScheduleCadenceService } from './schedule-cadence-service.js'
import { ScheduleRepo } from './schedule-repo.js'

export { frequencyToDays } from '@subq/shared'

export const ScheduleRpcHandlersLive = ScheduleRpcs.toLayer(
  Effect.gen(function* () {
    const scheduleRepo = yield* ScheduleRepo
    const scheduleCadence = yield* ScheduleCadenceService

    const ScheduleList = Effect.fn('rpc.schedule.list')(function* () {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logDebug('ScheduleList called').pipe(Effect.annotateLogs({ rpc: 'ScheduleList', userId: user.id }))
      const result = yield* scheduleRepo.list(user.id)
      yield* Effect.logDebug('ScheduleList completed').pipe(
        Effect.annotateLogs({ rpc: 'ScheduleList', count: result.length }),
      )
      return result
    })

    const ScheduleGetActive = Effect.fn('rpc.schedule.getActive')(function* () {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logDebug('ScheduleGetActive called').pipe(
        Effect.annotateLogs({ rpc: 'ScheduleGetActive', userId: user.id }),
      )
      const result = yield* scheduleRepo.getActive(user.id).pipe(Effect.map(Option.getOrNull))
      yield* Effect.logDebug('ScheduleGetActive completed').pipe(
        Effect.annotateLogs({ rpc: 'ScheduleGetActive', found: !!result, scheduleId: result?.id ?? 'none' }),
      )
      return result
    })

    const ScheduleGet = Effect.fn('rpc.schedule.get')(function* ({ id }: { id: InjectionScheduleId }) {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logDebug('ScheduleGet called').pipe(Effect.annotateLogs({ rpc: 'ScheduleGet', id }))
      const result = yield* scheduleRepo.findById(id, user.id).pipe(Effect.map(Option.getOrNull))
      yield* Effect.logDebug('ScheduleGet completed').pipe(
        Effect.annotateLogs({ rpc: 'ScheduleGet', id, found: !!result }),
      )
      return result
    })

    const ScheduleCreate = Effect.fn('rpc.schedule.create')(function* (data: InjectionScheduleCreate) {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logInfo('ScheduleCreate called').pipe(
        Effect.annotateLogs({
          rpc: 'ScheduleCreate',
          userId: user.id,
          name: data.name,
          drug: data.drug,
          frequency: data.frequency,
          phasesCount: data.phases.length,
        }),
      )
      const result = yield* scheduleRepo.create(data, user.id)
      yield* Effect.logInfo('ScheduleCreate completed').pipe(
        Effect.annotateLogs({ rpc: 'ScheduleCreate', id: result.id, name: result.name }),
      )
      return result
    })

    const ScheduleUpdate = Effect.fn('rpc.schedule.update')(function* (data: InjectionScheduleUpdate) {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logInfo('ScheduleUpdate called').pipe(
        Effect.annotateLogs({ rpc: 'ScheduleUpdate', id: data.id, isActive: data.isActive }),
      )
      const result = yield* scheduleRepo.update(data, user.id)
      yield* Effect.logInfo('ScheduleUpdate completed').pipe(
        Effect.annotateLogs({ rpc: 'ScheduleUpdate', id: data.id }),
      )
      return result
    })

    const ScheduleDelete = Effect.fn('rpc.schedule.delete')(function* ({ id }: { id: InjectionScheduleId }) {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logInfo('ScheduleDelete called').pipe(Effect.annotateLogs({ rpc: 'ScheduleDelete', id }))
      const result = yield* scheduleRepo.delete(id, user.id)
      yield* Effect.logInfo('ScheduleDelete completed').pipe(
        Effect.annotateLogs({ rpc: 'ScheduleDelete', id, deleted: result }),
      )
      return result
    })

    const ScheduleGetNextDose = Effect.fn('rpc.schedule.getNextDose')(function* () {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logDebug('ScheduleGetNextDose called').pipe(
        Effect.annotateLogs({ rpc: 'ScheduleGetNextDose', userId: user.id }),
      )

      const result = yield* scheduleCadence.getNextScheduledDose(user.id)

      if (result === null) {
        yield* Effect.logDebug('ScheduleGetNextDose: no dose').pipe(Effect.annotateLogs({ rpc: 'ScheduleGetNextDose' }))
        return null
      }

      yield* Effect.logDebug('ScheduleGetNextDose completed').pipe(
        Effect.annotateLogs({
          rpc: 'ScheduleGetNextDose',
          scheduleId: result.scheduleId,
          phase: result.currentPhase,
          daysUntilDue: result.daysUntilDue,
          isOverdue: result.isOverdue,
        }),
      )

      return result
    })

    const ScheduleGetView = Effect.fn('rpc.schedule.getView')(function* ({ id }: { id: InjectionScheduleId }) {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logDebug('ScheduleGetView called').pipe(
        Effect.annotateLogs({ rpc: 'ScheduleGetView', id, userId: user.id }),
      )

      const result = yield* scheduleCadence.getScheduleView(user.id, id)
      if (result === null) {
        yield* Effect.logDebug('ScheduleGetView: not found').pipe(Effect.annotateLogs({ rpc: 'ScheduleGetView', id }))
        return null
      }

      yield* Effect.logDebug('ScheduleGetView completed').pipe(
        Effect.annotateLogs({
          rpc: 'ScheduleGetView',
          id,
          totalPhases: result.phases.length,
          totalCompletedInjections: result.totalCompletedInjections,
        }),
      )

      return result
    })

    return {
      ScheduleList,
      ScheduleGetActive,
      ScheduleGet,
      ScheduleCreate,
      ScheduleUpdate,
      ScheduleDelete,
      ScheduleGetNextDose,
      ScheduleGetView,
    }
  }),
)
