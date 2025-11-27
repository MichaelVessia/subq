import {
  AuthContext,
  Dosage,
  type InjectionScheduleCreate,
  type InjectionScheduleId,
  type InjectionScheduleUpdate,
  NextScheduledDose,
  type PhaseOrder,
  PhaseInjectionSummary,
  ScheduleDatabaseError,
  ScheduleName,
  SchedulePhaseView,
  ScheduleRpcs,
  ScheduleView,
} from '@scale/shared'
import { Effect, Option } from 'effect'
import { InjectionLogRepo } from '../injection/injection-log-repo.js'
import { ScheduleRepo } from './schedule-repo.js'

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
    const injectionLogRepo = yield* InjectionLogRepo

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
            // Indefinite phase (null duration) - we're in this phase and stay here
            if (phase.durationDays === null) {
              currentPhaseIndex = i
              break
            }
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

      ScheduleGetView: ({ id }: { id: InjectionScheduleId }) =>
        Effect.gen(function* () {
          const { user } = yield* AuthContext
          yield* Effect.logDebug('ScheduleGetView called', { id, userId: user.id })

          // Get schedule
          const scheduleOpt = yield* scheduleRepo.findById(id)
          if (Option.isNone(scheduleOpt)) {
            yield* Effect.logInfo('ScheduleGetView: schedule not found', { id })
            return null
          }

          const schedule = scheduleOpt.value

          // Get all injection logs for this schedule
          const injections = yield* injectionLogRepo
            .listBySchedule(id, user.id)
            .pipe(Effect.mapError((e) => ScheduleDatabaseError.make({ operation: e.operation, cause: e.cause })))

          // Calculate phase boundaries and assign injections
          const intervalDays = frequencyToDays(schedule.frequency)
          let cumulativeDays = 0
          const now = new Date()

          const phaseViews: SchedulePhaseView[] = schedule.phases.map((phase) => {
            const phaseStartDate = new Date(schedule.startDate)
            phaseStartDate.setDate(phaseStartDate.getDate() + cumulativeDays)

            // Indefinite phase has no end date
            const isIndefinite = phase.durationDays === null
            const phaseEndDate = isIndefinite
              ? null
              : (() => {
                  const end = new Date(phaseStartDate)
                  end.setDate(end.getDate() + phase.durationDays - 1)
                  return end
                })()

            // Determine phase status
            let status: 'completed' | 'current' | 'upcoming'
            if (isIndefinite) {
              // Indefinite phase is current if we've reached it, never completed
              status = now >= phaseStartDate ? 'current' : 'upcoming'
            } else if (phaseEndDate && now > phaseEndDate) {
              status = 'completed'
            } else if (now >= phaseStartDate) {
              status = 'current'
            } else {
              status = 'upcoming'
            }

            // Calculate expected injections for this phase (null for indefinite)
            const expectedInjections = isIndefinite ? null : Math.ceil(phase.durationDays / intervalDays)

            // Find injections that fall within this phase's date range
            // For indefinite phases, include all injections from start date onwards
            const phaseInjections = injections.filter((inj) => {
              const injDate = new Date(inj.datetime)
              if (isIndefinite) {
                return injDate >= phaseStartDate
              }
              return phaseEndDate && injDate >= phaseStartDate && injDate <= phaseEndDate
            })

            if (!isIndefinite && phase.durationDays !== null) {
              cumulativeDays += phase.durationDays
            }

            return new SchedulePhaseView({
              id: phase.id,
              order: phase.order,
              durationDays: phase.durationDays,
              dosage: phase.dosage,
              startDate: phaseStartDate,
              endDate: phaseEndDate,
              status,
              expectedInjections,
              completedInjections: phaseInjections.length,
              injections: phaseInjections.map(
                (inj) =>
                  new PhaseInjectionSummary({
                    id: inj.id,
                    datetime: inj.datetime,
                    dosage: inj.dosage,
                    injectionSite: inj.injectionSite,
                  }),
              ),
            })
          })

          // Calculate total schedule end date (null if any phase is indefinite)
          const hasIndefinitePhase = schedule.phases.some((p) => p.durationDays === null)
          const scheduleEndDate = hasIndefinitePhase
            ? null
            : (() => {
                const totalDays = schedule.phases.reduce((sum, p) => sum + (p.durationDays ?? 0), 0)
                const end = new Date(schedule.startDate)
                end.setDate(end.getDate() + totalDays - 1)
                return end
              })()

          // Total expected is null if any phase is indefinite
          const totalExpectedInjections = hasIndefinitePhase
            ? null
            : phaseViews.reduce((sum, p) => sum + (p.expectedInjections ?? 0), 0)
          const totalCompletedInjections = phaseViews.reduce((sum, p) => sum + p.completedInjections, 0)

          const view = new ScheduleView({
            id: schedule.id,
            name: schedule.name,
            drug: schedule.drug,
            source: schedule.source,
            frequency: schedule.frequency,
            startDate: schedule.startDate,
            endDate: scheduleEndDate,
            isActive: schedule.isActive,
            notes: schedule.notes,
            totalExpectedInjections,
            totalCompletedInjections,
            phases: phaseViews,
            createdAt: schedule.createdAt,
            updatedAt: schedule.updatedAt,
          })

          yield* Effect.logInfo('ScheduleGetView completed', {
            id,
            userId: user.id,
            totalPhases: phaseViews.length,
            totalCompletedInjections,
          })

          return view
        }),
    }
  }).pipe(Effect.tap(() => Effect.logInfo('Schedule RPC handlers initialized'))),
)
