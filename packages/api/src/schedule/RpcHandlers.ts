import {
  AuthContext,
  Dosage,
  type InjectionScheduleCreate,
  type InjectionScheduleId,
  type InjectionScheduleUpdate,
  NextScheduledDose,
  type PhaseOrder,
  ScheduleName,
  ScheduleRpcs,
} from '@scale/shared'
import { Effect, Option } from 'effect'
import { ScheduleRepo } from './ScheduleRepo.js'

// Frequency to days mapping
const frequencyToDays = (frequency: string): number => {
  switch (frequency) {
    case 'daily':
      return 1
    case 'every_3_days':
      return 3
    case 'weekly':
      return 7
    case 'every_2_weeks':
      return 14
    case 'monthly':
      return 30
    default:
      return 7
  }
}

export const ScheduleRpcHandlersLive = ScheduleRpcs.toLayer(
  Effect.gen(function* () {
    yield* Effect.logInfo('Initializing schedule RPC handlers...')
    const scheduleRepo = yield* ScheduleRepo

    return {
      ScheduleList: () =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('ScheduleList called', { userId: user.id })
          const result = yield* scheduleRepo.list(user.id)
          yield* Effect.logInfo('ScheduleList completed', { count: result.length, userId: user.id })
          return result
        }),

      ScheduleGetActive: () =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('ScheduleGetActive called', { userId: user.id })
          const result = yield* scheduleRepo.getActive(user.id).pipe(Effect.map(Option.getOrNull))
          yield* Effect.logInfo('ScheduleGetActive completed', { userId: user.id, found: !!result })
          return result
        }),

      ScheduleGet: ({ id }: { id: InjectionScheduleId }) =>
        Effect.gen(function* () {
          yield* Effect.logDebug('ScheduleGet called', { id })
          const result = yield* scheduleRepo.findById(id).pipe(Effect.map(Option.getOrNull))
          yield* Effect.logInfo('ScheduleGet completed', { id, found: !!result })
          return result
        }),

      ScheduleCreate: (data: InjectionScheduleCreate) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logInfo('ScheduleCreate called', {
            userId: user.id,
            name: data.name,
            drug: data.drug,
          })
          const result = yield* scheduleRepo.create(data, user.id)
          yield* Effect.logInfo('ScheduleCreate completed', { id: result.id, userId: user.id })
          return result
        }),

      ScheduleUpdate: (data: InjectionScheduleUpdate) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('ScheduleUpdate called', { id: data.id })
          const result = yield* scheduleRepo.update(data)
          yield* Effect.logInfo('ScheduleUpdate completed', { id: result.id })
          return result
        }),

      ScheduleDelete: ({ id }: { id: InjectionScheduleId }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('ScheduleDelete called', { id })
          const result = yield* scheduleRepo.delete(id)
          yield* Effect.logInfo('ScheduleDelete completed', { id, success: result })
          return result
        }),

      ScheduleGetNextDose: () =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('ScheduleGetNextDose called', { userId: user.id })

          // Get active schedule
          const scheduleOpt = yield* scheduleRepo.getActive(user.id)
          if (Option.isNone(scheduleOpt)) {
            yield* Effect.logInfo('ScheduleGetNextDose: no active schedule', { userId: user.id })
            return null
          }

          const schedule = scheduleOpt.value
          if (schedule.phases.length === 0) {
            yield* Effect.logInfo('ScheduleGetNextDose: schedule has no phases', { scheduleId: schedule.id })
            return null
          }

          // Get last injection for this drug
          const lastInjectionOpt = yield* scheduleRepo.getLastInjectionDate(user.id, schedule.drug)
          const now = new Date()

          // Determine current phase based on days since start
          const startDate = schedule.startDate
          const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

          // Find which phase we're in
          let cumulativeDays = 0
          let currentPhaseIndex = 0
          for (let i = 0; i < schedule.phases.length; i++) {
            const phase = schedule.phases[i]
            if (!phase) continue
            if (daysSinceStart < cumulativeDays + phase.durationDays) {
              currentPhaseIndex = i
              break
            }
            cumulativeDays += phase.durationDays
            // If we've gone past all phases, stay on the last one
            if (i === schedule.phases.length - 1) {
              currentPhaseIndex = i
            }
          }

          const currentPhase = schedule.phases[currentPhaseIndex]
          if (!currentPhase) {
            return null
          }

          // Calculate next dose date
          const intervalDays = frequencyToDays(schedule.frequency)
          let suggestedDate: Date

          if (Option.isNone(lastInjectionOpt)) {
            // No injections yet, suggest today or start date (whichever is later)
            suggestedDate = now > startDate ? now : startDate
          } else {
            const lastInjection = lastInjectionOpt.value
            suggestedDate = new Date(lastInjection.getTime() + intervalDays * 24 * 60 * 60 * 1000)
          }

          const daysUntilDue = Math.floor((suggestedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          const isOverdue = daysUntilDue < 0

          const nextDose = new NextScheduledDose({
            scheduleId: schedule.id,
            scheduleName: ScheduleName.make(schedule.name),
            drug: schedule.drug,
            dosage: Dosage.make(currentPhase.dosage),
            suggestedDate,
            currentPhase: (currentPhaseIndex + 1) as PhaseOrder,
            totalPhases: schedule.phases.length,
            daysUntilDue,
            isOverdue,
          })

          yield* Effect.logInfo('ScheduleGetNextDose completed', {
            userId: user.id,
            scheduleId: schedule.id,
            phase: currentPhaseIndex + 1,
            daysUntilDue,
            isOverdue,
          })

          return nextDose
        }),
    }
  }).pipe(Effect.tap(() => Effect.logInfo('Schedule RPC handlers initialized'))),
)
