/**
 * Tests for soft-delete filtering across all synced tables.
 * Verifies that queries properly exclude rows with deleted_at set.
 */

import { Limit, Offset } from '@subq/shared'
import { Effect, Option } from 'effect'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { WeightLogRepo, WeightLogRepoLive } from '../src/weight/weight-log-repo.js'
import { InjectionLogRepo, InjectionLogRepoLive } from '../src/injection/injection-log-repo.js'
import { ScheduleRepo, ScheduleRepoLive } from '../src/schedule/schedule-repo.js'
import { InventoryRepo, InventoryRepoLive } from '../src/inventory/inventory-repo.js'
import { GoalRepo, GoalRepoLive } from '../src/goals/goal-repo.js'
import { SettingsRepo, SettingsRepoLive } from '../src/settings/settings-repo.js'
import {
  insertGoal,
  insertInjectionLog,
  insertInventory,
  insertSchedule,
  insertSchedulePhase,
  insertSettings,
  insertWeightLog,
  makeInitializedTestLayer,
  softDeleteGoal,
  softDeleteInjectionLog,
  softDeleteInventory,
  softDeleteSchedule,
  softDeleteSchedulePhase,
  softDeleteSettings,
  softDeleteWeightLog,
} from './helpers/test-db.js'

const WeightLogTestLayer = makeInitializedTestLayer(WeightLogRepoLive)
const InjectionLogTestLayer = makeInitializedTestLayer(InjectionLogRepoLive)
const ScheduleTestLayer = makeInitializedTestLayer(ScheduleRepoLive)
const InventoryTestLayer = makeInitializedTestLayer(InventoryRepoLive)
const GoalTestLayer = makeInitializedTestLayer(GoalRepoLive)
const SettingsTestLayer = makeInitializedTestLayer(SettingsRepoLive)

describe('Soft Delete Filtering', () => {
  describe('weight_logs', () => {
    it.layer(WeightLogTestLayer)((it) => {
      it.effect('findById does not return soft-deleted weight_log', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-1', new Date('2024-01-15T10:00:00Z'), 180, 'user-123')
          yield* softDeleteWeightLog('wl-1')

          const repo = yield* WeightLogRepo
          const found = yield* repo.findById('wl-1', 'user-123')
          expect(Option.isNone(found)).toBe(true)
        }),
      )
    })

    it.layer(WeightLogTestLayer)((it) => {
      it.effect('list does not return soft-deleted weight_logs', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-1', new Date('2024-01-15T10:00:00Z'), 180, 'user-123')
          yield* insertWeightLog('wl-2', new Date('2024-01-16T10:00:00Z'), 181, 'user-123')
          yield* softDeleteWeightLog('wl-1')

          const repo = yield* WeightLogRepo
          const logs = yield* repo.list({ limit: Limit.make(50), offset: Offset.make(0) }, 'user-123')

          expect(logs.length).toBe(1)
          expect(logs[0]!.id).toBe('wl-2')
        }),
      )
    })
  })

  describe('injection_logs', () => {
    it.layer(InjectionLogTestLayer)((it) => {
      it.effect('findById does not return soft-deleted injection_log', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog('il-1', new Date('2024-01-15T10:00:00Z'), 'Semaglutide', '0.25mg', 'user-123')
          yield* softDeleteInjectionLog('il-1')

          const repo = yield* InjectionLogRepo
          const found = yield* repo.findById('il-1', 'user-123')
          expect(Option.isNone(found)).toBe(true)
        }),
      )
    })

    it.layer(InjectionLogTestLayer)((it) => {
      it.effect('list does not return soft-deleted injection_logs', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog('il-1', new Date('2024-01-15T10:00:00Z'), 'Semaglutide', '0.25mg', 'user-123')
          yield* insertInjectionLog('il-2', new Date('2024-01-16T10:00:00Z'), 'Semaglutide', '0.5mg', 'user-123')
          yield* softDeleteInjectionLog('il-1')

          const repo = yield* InjectionLogRepo
          const logs = yield* repo.list({ limit: Limit.make(50), offset: Offset.make(0) }, 'user-123')

          expect(logs.length).toBe(1)
          expect(logs[0]!.id).toBe('il-2')
        }),
      )
    })

    it.layer(InjectionLogTestLayer)((it) => {
      it.effect('getUniqueDrugs excludes soft-deleted injection_logs', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog('il-1', new Date('2024-01-15T10:00:00Z'), 'Semaglutide', '0.25mg', 'user-123')
          yield* insertInjectionLog('il-2', new Date('2024-01-16T10:00:00Z'), 'Tirzepatide', '2.5mg', 'user-123')
          yield* softDeleteInjectionLog('il-1')

          const repo = yield* InjectionLogRepo
          const drugs = yield* repo.getUniqueDrugs('user-123')

          expect(drugs.length).toBe(1)
          expect(drugs[0]).toBe('Tirzepatide')
        }),
      )
    })
  })

  describe('injection_schedules', () => {
    it.layer(ScheduleTestLayer)((it) => {
      it.effect('findById does not return soft-deleted schedule', () =>
        Effect.gen(function* () {
          yield* insertSchedule('sched-1', 'Test Schedule', 'Semaglutide', 'weekly', new Date('2024-01-01'), 'user-123')
          yield* softDeleteSchedule('sched-1')

          const repo = yield* ScheduleRepo
          const found = yield* repo.findById('sched-1', 'user-123')
          expect(Option.isNone(found)).toBe(true)
        }),
      )
    })

    it.layer(ScheduleTestLayer)((it) => {
      it.effect('list does not return soft-deleted schedules', () =>
        Effect.gen(function* () {
          yield* insertSchedule('sched-1', 'Schedule 1', 'Semaglutide', 'weekly', new Date('2024-01-01'), 'user-123')
          yield* insertSchedule('sched-2', 'Schedule 2', 'Tirzepatide', 'weekly', new Date('2024-02-01'), 'user-123', {
            isActive: false,
          })
          yield* softDeleteSchedule('sched-1')

          const repo = yield* ScheduleRepo
          const schedules = yield* repo.list('user-123')

          expect(schedules.length).toBe(1)
          expect(schedules[0]!.id).toBe('sched-2')
        }),
      )
    })

    it.layer(ScheduleTestLayer)((it) => {
      it.effect('getActive does not return soft-deleted schedule', () =>
        Effect.gen(function* () {
          yield* insertSchedule(
            'sched-1',
            'Active Schedule',
            'Semaglutide',
            'weekly',
            new Date('2024-01-01'),
            'user-123',
          )
          yield* softDeleteSchedule('sched-1')

          const repo = yield* ScheduleRepo
          const active = yield* repo.getActive('user-123')
          expect(Option.isNone(active)).toBe(true)
        }),
      )
    })

    it.layer(ScheduleTestLayer)((it) => {
      it.effect('list excludes soft-deleted phases from schedule', () =>
        Effect.gen(function* () {
          yield* insertSchedule('sched-1', 'Test Schedule', 'Semaglutide', 'weekly', new Date('2024-01-01'), 'user-123')
          yield* insertSchedulePhase('phase-1', 'sched-1', 1, '0.25mg', 28)
          yield* insertSchedulePhase('phase-2', 'sched-1', 2, '0.5mg', 28)
          yield* softDeleteSchedulePhase('phase-1')

          const repo = yield* ScheduleRepo
          const schedules = yield* repo.list('user-123')

          expect(schedules.length).toBe(1)
          expect(schedules[0]!.phases.length).toBe(1)
          expect(schedules[0]!.phases[0]!.id).toBe('phase-2')
        }),
      )
    })
  })

  describe('glp1_inventory', () => {
    it.layer(InventoryTestLayer)((it) => {
      it.effect('findById does not return soft-deleted inventory', () =>
        Effect.gen(function* () {
          yield* insertInventory('inv-1', 'Semaglutide', 'Pharmacy', 'vial', '2mg/mL', 'new', 'user-123')
          yield* softDeleteInventory('inv-1')

          const repo = yield* InventoryRepo
          const found = yield* repo.findById('inv-1', 'user-123')
          expect(Option.isNone(found)).toBe(true)
        }),
      )
    })

    it.layer(InventoryTestLayer)((it) => {
      it.effect('list does not return soft-deleted inventory', () =>
        Effect.gen(function* () {
          yield* insertInventory('inv-1', 'Semaglutide', 'Pharmacy', 'vial', '2mg/mL', 'new', 'user-123')
          yield* insertInventory('inv-2', 'Tirzepatide', 'Pharmacy', 'pen', '2.5mg/0.5mL', 'opened', 'user-123')
          yield* softDeleteInventory('inv-1')

          const repo = yield* InventoryRepo
          const items = yield* repo.list({}, 'user-123')

          expect(items.length).toBe(1)
          expect(items[0]!.id).toBe('inv-2')
        }),
      )
    })
  })

  describe('user_goals', () => {
    it.layer(GoalTestLayer)((it) => {
      it.effect('findById does not return soft-deleted goal', () =>
        Effect.gen(function* () {
          yield* insertGoal('goal-1', 'user-123', 150, 180, new Date('2024-01-01'))
          yield* softDeleteGoal('goal-1')

          const repo = yield* GoalRepo
          const found = yield* repo.findById('goal-1', 'user-123')
          expect(Option.isNone(found)).toBe(true)
        }),
      )
    })

    it.layer(GoalTestLayer)((it) => {
      it.effect('list does not return soft-deleted goals', () =>
        Effect.gen(function* () {
          yield* insertGoal('goal-1', 'user-123', 150, 180, new Date('2024-01-01'))
          yield* insertGoal('goal-2', 'user-123', 145, 175, new Date('2024-02-01'), { isActive: false })
          yield* softDeleteGoal('goal-1')

          const repo = yield* GoalRepo
          const goals = yield* repo.list('user-123')

          expect(goals.length).toBe(1)
          expect(goals[0]!.id).toBe('goal-2')
        }),
      )
    })

    it.layer(GoalTestLayer)((it) => {
      it.effect('getActive does not return soft-deleted goal', () =>
        Effect.gen(function* () {
          yield* insertGoal('goal-1', 'user-123', 150, 180, new Date('2024-01-01'))
          yield* softDeleteGoal('goal-1')

          const repo = yield* GoalRepo
          const active = yield* repo.getActive('user-123')
          expect(Option.isNone(active)).toBe(true)
        }),
      )
    })
  })

  describe('user_settings', () => {
    it.layer(SettingsTestLayer)((it) => {
      it.effect('get does not return soft-deleted settings', () =>
        Effect.gen(function* () {
          yield* insertSettings('settings-1', 'user-123', 'kg')
          yield* softDeleteSettings('settings-1')

          const repo = yield* SettingsRepo
          const found = yield* repo.get('user-123')
          expect(Option.isNone(found)).toBe(true)
        }),
      )
    })

    it.layer(SettingsTestLayer)((it) => {
      it.effect('upsert creates new settings when existing is soft-deleted', () =>
        Effect.gen(function* () {
          yield* insertSettings('settings-1', 'user-123', 'kg')
          yield* softDeleteSettings('settings-1')

          const repo = yield* SettingsRepo
          const newSettings = yield* repo.upsert('user-123', { weightUnit: 'lbs' })

          expect(newSettings.weightUnit).toBe('lbs')
          expect(newSettings.id).not.toBe('settings-1')
        }),
      )
    })
  })
})
