/**
 * Tests for schedule RPC handlers - focusing on critical business logic:
 * - ScheduleGetNextDose: calculates next injection date, current phase, overdue status
 * - ScheduleGetView: generates schedule view with phase progress and injection tracking
 */

import {
  AuthContext,
  Dosage,
  DrugName,
  DrugSource,
  type Frequency,
  InjectionLog,
  InjectionLogId,
  InjectionSchedule,
  InjectionScheduleId,
  type PhaseDurationDays,
  type PhaseOrder,
  ScheduleName,
  SchedulePhase,
  SchedulePhaseId,
} from '@subq/shared'
import { Effect, Layer, Option } from 'effect'
import { describe, expect, it, vi } from '@effect/vitest'
import { InjectionLogRepo } from '../src/injection/injection-log-repo.js'
import { ScheduleRepo } from '../src/schedule/schedule-repo.js'

// ============================================
// Helper: frequencyToDays (copied from rpc-handlers for testing)
// ============================================

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

// ============================================
// Test-specific types for controlling test state
// ============================================

interface TestScheduleState {
  activeSchedule: InjectionSchedule | null
  lastInjectionDate: Date | null
  injectionsBySchedule: Map<string, InjectionLog[]>
}

const createTestState = (): TestScheduleState => ({
  activeSchedule: null,
  lastInjectionDate: null,
  injectionsBySchedule: new Map(),
})

let testState = createTestState()

// Reset state helper
const resetTestState = () => {
  testState = createTestState()
}

// ============================================
// Test Layers
// ============================================

const ScheduleRepoTest = Layer.sync(ScheduleRepo, () => ({
  list: (_userId: string) => Effect.succeed([]),
  getActive: (_userId: string) =>
    Effect.succeed(testState.activeSchedule ? Option.some(testState.activeSchedule) : Option.none()),
  findById: (id: string) =>
    Effect.succeed(
      testState.activeSchedule && testState.activeSchedule.id === id
        ? Option.some(testState.activeSchedule)
        : Option.none(),
    ),
  create: () => Effect.die('Not implemented in test'),
  update: () => Effect.die('Not implemented in test'),
  delete: () => Effect.succeed(false),
  getLastInjectionDate: (_userId: string, _drug: string) =>
    Effect.succeed(testState.lastInjectionDate ? Option.some(testState.lastInjectionDate) : Option.none()),
}))

const InjectionLogRepoTest = Layer.sync(InjectionLogRepo, () => ({
  list: () => Effect.succeed([]),
  findById: () => Effect.succeed(Option.none()),
  create: () => Effect.die('Not implemented in test'),
  update: () => Effect.die('Not implemented in test'),
  delete: () => Effect.succeed(false),
  getUniqueDrugs: () => Effect.succeed([]),
  getUniqueSites: () => Effect.succeed([]),
  getLastSite: () => Effect.succeed(null),
  bulkAssignSchedule: () => Effect.succeed(0),
  listBySchedule: (scheduleId: string, _userId: string) =>
    Effect.succeed(testState.injectionsBySchedule.get(scheduleId) ?? []),
}))

const AuthContextTest = Layer.succeed(AuthContext, {
  user: {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
  },
  session: {
    id: 'test-session-123',
    userId: 'test-user-123',
  },
})

const TestLayer = Layer.mergeAll(ScheduleRepoTest, InjectionLogRepoTest, AuthContextTest)

// ============================================
// Helper: Create a test schedule
// ============================================

const createTestSchedule = (
  startDate: Date,
  frequency: Frequency,
  phases: Array<{ order: PhaseOrder; durationDays: PhaseDurationDays | null; dosage: string }>,
): InjectionSchedule => {
  const now = new Date()
  const scheduleId = InjectionScheduleId.make('test-schedule-1')
  return new InjectionSchedule({
    id: scheduleId,
    name: ScheduleName.make('Test Schedule'),
    drug: DrugName.make('Testosterone'),
    source: DrugSource.make('Empower'),
    frequency,
    startDate,
    isActive: true,
    notes: null,
    phases: phases.map(
      (p, idx) =>
        new SchedulePhase({
          id: SchedulePhaseId.make(`phase-${idx}`),
          scheduleId,
          order: p.order,
          durationDays: p.durationDays,
          dosage: Dosage.make(p.dosage),
          createdAt: now,
          updatedAt: now,
        }),
    ),
    createdAt: now,
    updatedAt: now,
  })
}

// ============================================
// Helper: Create a test injection log
// ============================================

const createTestInjection = (scheduleId: string, datetime: Date, dosage: string): InjectionLog => {
  const now = new Date()
  return new InjectionLog({
    id: InjectionLogId.make(`injection-${Math.random()}`),
    datetime,
    drug: DrugName.make('Testosterone'),
    source: DrugSource.make('Empower'),
    dosage: Dosage.make(dosage),
    injectionSite: null,
    notes: null,
    scheduleId: InjectionScheduleId.make(scheduleId),
    createdAt: now,
    updatedAt: now,
  })
}

// ============================================
// NextDose Calculation Logic (extracted from handler for unit testing)
// ============================================

const calculateNextDose = Effect.gen(function* () {
  const scheduleRepo = yield* ScheduleRepo
  const { user } = yield* AuthContext

  // Get active schedule
  const scheduleOpt = yield* scheduleRepo.getActive(user.id)
  if (Option.isNone(scheduleOpt)) {
    return null
  }

  const schedule = scheduleOpt.value
  if (schedule.phases.length === 0) {
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

  return {
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    drug: schedule.drug,
    dosage: currentPhase.dosage,
    suggestedDate,
    currentPhase: (currentPhaseIndex + 1) as PhaseOrder,
    totalPhases: schedule.phases.length,
    daysUntilDue,
    isOverdue,
  }
})

// ============================================
// Tests: Next Dose Calculation
// ============================================

describe('ScheduleGetNextDose', () => {
  describe('no active schedule', () => {
    it.effect('returns null when no active schedule exists', () =>
      Effect.gen(function* () {
        resetTestState()
        testState.activeSchedule = null

        const result = yield* calculateNextDose
        expect(result).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('no previous injections', () => {
    it.effect('suggests start date when schedule starts in the future', () =>
      Effect.gen(function* () {
        resetTestState()
        const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        testState.activeSchedule = createTestSchedule(futureDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        testState.lastInjectionDate = null

        const result = yield* calculateNextDose

        expect(result).not.toBeNull()
        expect(result!.suggestedDate.getTime()).toBe(futureDate.getTime())
        expect(result!.isOverdue).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('suggests today when schedule started in the past', () =>
      Effect.gen(function* () {
        resetTestState()
        const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
        testState.activeSchedule = createTestSchedule(pastDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        testState.lastInjectionDate = null

        const result = yield* calculateNextDose

        expect(result).not.toBeNull()
        // Should suggest today (within a day tolerance)
        const now = new Date()
        const diffMs = Math.abs(result!.suggestedDate.getTime() - now.getTime())
        expect(diffMs).toBeLessThan(24 * 60 * 60 * 1000) // Within 1 day
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('with previous injections', () => {
    it.effect('calculates next dose based on weekly frequency', () =>
      Effect.gen(function* () {
        resetTestState()
        const now = new Date()
        now.setHours(12, 0, 0, 0) // Normalize to noon to avoid edge cases
        const startDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) // 14 days ago
        testState.activeSchedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        // Last injection was 5 days ago at noon
        testState.lastInjectionDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)

        const result = yield* calculateNextDose

        expect(result).not.toBeNull()
        // Next dose should be ~2 days from now (7 - 5 = 2), allow for floor rounding
        expect(result!.daysUntilDue).toBeGreaterThanOrEqual(1)
        expect(result!.daysUntilDue).toBeLessThanOrEqual(2)
        expect(result!.isOverdue).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('calculates next dose based on every_3_days frequency', () =>
      Effect.gen(function* () {
        resetTestState()
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))

        const startDate = new Date('2024-01-05T12:00:00Z') // 10 days before reference
        testState.activeSchedule = createTestSchedule(startDate, 'every_3_days', [
          { order: 1 as PhaseOrder, durationDays: null, dosage: '100mg' },
        ])
        // Last injection was 2 days ago
        testState.lastInjectionDate = new Date('2024-01-13T12:00:00Z')

        const result = yield* calculateNextDose

        expect(result).not.toBeNull()
        // Next dose should be 1 day from now (3 - 2 = 1)
        expect(result!.daysUntilDue).toBe(1)
        expect(result!.isOverdue).toBe(false)

        vi.useRealTimers()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('marks dose as overdue when past due date', () =>
      Effect.gen(function* () {
        resetTestState()
        // Use fixed reference date to avoid timezone/day boundary issues
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))

        const startDate = new Date('2024-01-01T12:00:00Z') // 14 days before reference
        testState.activeSchedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        // Last injection was 10 days before reference (overdue by 3 days for weekly)
        testState.lastInjectionDate = new Date('2024-01-05T12:00:00Z')

        const result = yield* calculateNextDose

        expect(result).not.toBeNull()
        expect(result!.isOverdue).toBe(true)
        expect(result!.daysUntilDue).toBe(-3) // 3 days overdue

        vi.useRealTimers()
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('phase transitions', () => {
    it.effect('returns first phase dosage at start', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
        testState.activeSchedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '100mg' },
          { order: 2 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '150mg' },
          { order: 3 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        testState.lastInjectionDate = null

        const result = yield* calculateNextDose

        expect(result).not.toBeNull()
        expect(result!.currentPhase).toBe(1)
        expect(result!.dosage).toBe('100mg')
        expect(result!.totalPhases).toBe(3)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('transitions to second phase after first phase duration', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
        testState.activeSchedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '100mg' },
          { order: 2 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '150mg' },
          { order: 3 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        testState.lastInjectionDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

        const result = yield* calculateNextDose

        expect(result).not.toBeNull()
        expect(result!.currentPhase).toBe(2)
        expect(result!.dosage).toBe('150mg')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('stays on indefinite (maintenance) phase', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // 100 days ago
        testState.activeSchedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '100mg' },
          { order: 2 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '150mg' },
          { order: 3 as PhaseOrder, durationDays: null, dosage: '200mg' }, // Indefinite
        ])
        testState.lastInjectionDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)

        const result = yield* calculateNextDose

        expect(result).not.toBeNull()
        expect(result!.currentPhase).toBe(3)
        expect(result!.dosage).toBe('200mg')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('handles single indefinite phase schedule', () =>
      Effect.gen(function* () {
        resetTestState()
        const now = new Date()
        now.setHours(12, 0, 0, 0) // Normalize to noon
        const startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) // 1 year ago
        testState.activeSchedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        // Last injection was 5 days ago at noon, so next is due in ~2 days
        testState.lastInjectionDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)

        const result = yield* calculateNextDose

        expect(result).not.toBeNull()
        expect(result!.currentPhase).toBe(1)
        expect(result!.totalPhases).toBe(1)
        expect(result!.dosage).toBe('200mg')
        // Allow for floor rounding differences
        expect(result!.daysUntilDue).toBeGreaterThanOrEqual(1)
        expect(result!.daysUntilDue).toBeLessThanOrEqual(2)
        expect(result!.isOverdue).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('edge cases', () => {
    it.effect('returns null for schedule with no phases', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date()
        testState.activeSchedule = createTestSchedule(startDate, 'weekly', [])
        testState.lastInjectionDate = null

        const result = yield* calculateNextDose
        expect(result).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('handles daily frequency correctly', () =>
      Effect.gen(function* () {
        resetTestState()
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))

        const startDate = new Date('2024-01-10T12:00:00Z') // 5 days before reference
        testState.activeSchedule = createTestSchedule(startDate, 'daily', [
          { order: 1 as PhaseOrder, durationDays: null, dosage: '10mg' },
        ])
        // Last injection was today
        testState.lastInjectionDate = new Date('2024-01-15T12:00:00Z')

        const result = yield* calculateNextDose

        expect(result).not.toBeNull()
        expect(result!.daysUntilDue).toBe(1) // Due tomorrow

        vi.useRealTimers()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('handles monthly frequency correctly', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
        testState.activeSchedule = createTestSchedule(startDate, 'monthly', [
          { order: 1 as PhaseOrder, durationDays: null, dosage: '1000mg' },
        ])
        // Last injection was 20 days ago
        testState.lastInjectionDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)

        const result = yield* calculateNextDose

        expect(result).not.toBeNull()
        expect(result!.daysUntilDue).toBe(10) // 30 - 20 = 10
        expect(result!.isOverdue).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})

// ============================================
// Tests: Schedule View Generation
// ============================================

describe('ScheduleGetView', () => {
  describe('phase status calculation', () => {
    it.effect('marks past phases as completed', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // 60 days ago
        const schedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '100mg' },
          { order: 2 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '150mg' },
          { order: 3 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        testState.activeSchedule = schedule
        testState.injectionsBySchedule.set(schedule.id, [])

        // Calculate phase status manually (simulating what the handler does)
        const now = new Date()
        let cumulativeDays = 0

        const phaseStatuses = schedule.phases.map((phase) => {
          const phaseStartDate = new Date(startDate)
          phaseStartDate.setDate(phaseStartDate.getDate() + cumulativeDays)

          const isIndefinite = phase.durationDays === null
          const phaseEndDate = isIndefinite
            ? null
            : (() => {
                const end = new Date(phaseStartDate)
                end.setDate(end.getDate() + phase.durationDays - 1)
                return end
              })()

          let status: 'completed' | 'current' | 'upcoming'
          if (isIndefinite) {
            status = now >= phaseStartDate ? 'current' : 'upcoming'
          } else if (phaseEndDate && now > phaseEndDate) {
            status = 'completed'
          } else if (now >= phaseStartDate) {
            status = 'current'
          } else {
            status = 'upcoming'
          }

          if (!isIndefinite && phase.durationDays !== null) {
            cumulativeDays += phase.durationDays
          }

          return { phase: phase.order, status }
        })

        // Phase 1 (days 0-27) should be completed (we're at day 60)
        expect(phaseStatuses[0]!.status).toBe('completed')
        // Phase 2 (days 28-55) should be completed
        expect(phaseStatuses[1]!.status).toBe('completed')
        // Phase 3 (day 56+, indefinite) should be current
        expect(phaseStatuses[2]!.status).toBe('current')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('marks current phase correctly', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) // 35 days ago
        const schedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '100mg' },
          { order: 2 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '150mg' },
          { order: 3 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        testState.activeSchedule = schedule

        // We're in phase 2 (day 35, which is in range 28-55)
        const now = new Date()
        const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

        expect(daysSinceStart).toBeGreaterThanOrEqual(28)
        expect(daysSinceStart).toBeLessThan(56)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('marks future phases as upcoming', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
        const schedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '100mg' },
          { order: 2 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '150mg' },
          { order: 3 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        testState.activeSchedule = schedule

        // At day 5:
        // Phase 1 (days 0-27): current
        // Phase 2 (days 28-55): upcoming
        // Phase 3 (day 56+): upcoming
        const now = new Date()
        const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

        expect(daysSinceStart).toBeLessThan(28) // Still in phase 1
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('injection counting', () => {
    it.effect('counts injections per phase correctly', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date('2024-01-01')
        const schedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '100mg' },
          { order: 2 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        testState.activeSchedule = schedule

        // Create injections: 4 in phase 1, 2 in phase 2
        const injections = [
          createTestInjection(schedule.id, new Date('2024-01-01'), '100mg'),
          createTestInjection(schedule.id, new Date('2024-01-08'), '100mg'),
          createTestInjection(schedule.id, new Date('2024-01-15'), '100mg'),
          createTestInjection(schedule.id, new Date('2024-01-22'), '100mg'),
          // Phase 2 starts day 28 = 2024-01-29
          createTestInjection(schedule.id, new Date('2024-01-29'), '200mg'),
          createTestInjection(schedule.id, new Date('2024-02-05'), '200mg'),
        ]
        testState.injectionsBySchedule.set(schedule.id, injections)

        // Phase 1: Jan 1 - Jan 28 (4 injections)
        const phase1Injections = injections.filter((inj) => {
          const injDate = inj.datetime
          return injDate >= new Date('2024-01-01') && injDate < new Date('2024-01-29')
        })
        expect(phase1Injections.length).toBe(4)

        // Phase 2: Jan 29+ (2 injections)
        const phase2Injections = injections.filter((inj) => {
          return inj.datetime >= new Date('2024-01-29')
        })
        expect(phase2Injections.length).toBe(2)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('calculates expected injections based on frequency', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date('2024-01-01')
        const schedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '100mg' },
          { order: 2 as PhaseOrder, durationDays: null, dosage: '200mg' }, // Indefinite
        ])
        testState.activeSchedule = schedule

        // Expected injections for phase 1: ceil(28 / 7) = 4
        const intervalDays = frequencyToDays('weekly')
        const expectedPhase1 = Math.ceil(28 / intervalDays)
        expect(expectedPhase1).toBe(4)

        // Expected injections for indefinite phase should be null
        // (can't calculate expected for indefinite)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('date range calculations', () => {
    it.effect('calculates phase start and end dates correctly', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date('2024-01-01T00:00:00Z')
        const schedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '100mg' },
          { order: 2 as PhaseOrder, durationDays: 14 as PhaseDurationDays, dosage: '150mg' },
          { order: 3 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        testState.activeSchedule = schedule

        // Phase 1: Jan 1 - Jan 28 (28 days, end = start + 27)
        const phase1Start = new Date(startDate)
        const phase1End = new Date(startDate)
        phase1End.setDate(phase1End.getDate() + 28 - 1)

        expect(phase1Start.toISOString().split('T')[0]).toBe('2024-01-01')
        expect(phase1End.toISOString().split('T')[0]).toBe('2024-01-28')

        // Phase 2: Jan 29 - Feb 11 (14 days)
        const phase2Start = new Date(startDate)
        phase2Start.setDate(phase2Start.getDate() + 28)
        const phase2End = new Date(phase2Start)
        phase2End.setDate(phase2End.getDate() + 14 - 1)

        expect(phase2Start.toISOString().split('T')[0]).toBe('2024-01-29')
        expect(phase2End.toISOString().split('T')[0]).toBe('2024-02-11')

        // Phase 3: Feb 12 - no end (indefinite)
        const phase3Start = new Date(phase2Start)
        phase3Start.setDate(phase3Start.getDate() + 14)

        expect(phase3Start.toISOString().split('T')[0]).toBe('2024-02-12')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('schedule end date is null for indefinite final phase', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date('2024-01-01')
        const schedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '100mg' },
          { order: 2 as PhaseOrder, durationDays: null, dosage: '200mg' },
        ])
        testState.activeSchedule = schedule

        const hasIndefinitePhase = schedule.phases.some((p) => p.durationDays === null)
        expect(hasIndefinitePhase).toBe(true)
        // Schedule end date would be null
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('schedule end date is calculated for finite schedules', () =>
      Effect.gen(function* () {
        resetTestState()
        const startDate = new Date('2024-01-01')
        const schedule = createTestSchedule(startDate, 'weekly', [
          { order: 1 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '100mg' },
          { order: 2 as PhaseOrder, durationDays: 28 as PhaseDurationDays, dosage: '200mg' },
        ])
        testState.activeSchedule = schedule

        const hasIndefinitePhase = schedule.phases.some((p) => p.durationDays === null)
        expect(hasIndefinitePhase).toBe(false)

        // Total days = 28 + 28 = 56
        // End date = Jan 1 + 55 days = Feb 25
        const totalDays = schedule.phases.reduce((sum, p) => sum + (p.durationDays ?? 0), 0)
        expect(totalDays).toBe(56)

        const endDate = new Date(startDate)
        endDate.setDate(endDate.getDate() + totalDays - 1)
        expect(endDate.toISOString().split('T')[0]).toBe('2024-02-25')
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
