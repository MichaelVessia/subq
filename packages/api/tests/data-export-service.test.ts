import { describe, expect, it } from '@effect/vitest'
import {
  DataExport,
  Dosage,
  DrugName,
  ExportedSettings,
  InjectionLog,
  InjectionLogId,
  InjectionScheduleId,
  Notes,
  Weight,
  WeightLog,
  WeightLogId,
} from '@subq/shared'
import { DateTime, Effect } from 'effect'
import { DataExportService, DataExportServiceLive } from '../src/data-export/data-export-service.js'
import { insertSettings, insertWeightLog, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(DataExportServiceLive)

describe('DataExportService', () => {
  describe('exportData', () => {
    it.layer(TestLayer)((it) => {
      it.effect('exports empty data when user has no records', () =>
        Effect.gen(function* () {
          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          expect(result.version).toBe('1.0.0')
          expect(result.data.weightLogs).toHaveLength(0)
          expect(result.data.injectionLogs).toHaveLength(0)
          expect(result.data.inventory).toHaveLength(0)
          expect(result.data.schedules).toHaveLength(0)
          expect(result.data.goals).toHaveLength(0)
          expect(result.data.settings).toBeNull()
        }),
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('exports weight logs for user', () =>
        Effect.gen(function* () {
          // Insert data for user-123
          yield* insertWeightLog('wl-1', new Date('2024-01-01'), 200, 'user-123')
          yield* insertWeightLog('wl-2', new Date('2024-01-02'), 199, 'user-123')
          // Insert data for different user (should not be exported)
          yield* insertWeightLog('wl-3', new Date('2024-01-03'), 180, 'user-456')

          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          expect(result.data.weightLogs).toHaveLength(2)
          expect(result.data.weightLogs.map((w) => w.id)).toContain('wl-1')
          expect(result.data.weightLogs.map((w) => w.id)).toContain('wl-2')
          expect(result.data.weightLogs.map((w) => w.id)).not.toContain('wl-3')
        }),
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('exports user settings', () =>
        Effect.gen(function* () {
          yield* insertSettings('s-1', 'user-123', 'kg')

          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          expect(result.data.settings).not.toBeNull()
          expect(result.data.settings?.weightUnit).toBe('kg')
        }),
      )
    })
  })

  describe('importData', () => {
    it.layer(TestLayer)((it) => {
      it.effect('imports data and clears existing', () =>
        Effect.gen(function* () {
          // Insert existing data that should be deleted
          yield* insertWeightLog('existing-1', new Date('2024-01-01'), 200, 'user-123')
          yield* insertSettings('s-existing', 'user-123', 'lbs')

          const service = yield* DataExportService

          // Create import data
          const importData = new DataExport({
            version: '1.0.0',
            exportedAt: DateTime.nowUnsafe(),
            data: {
              weightLogs: [
                new WeightLog({
                  id: WeightLogId.make('imported-1'),
                  datetime: DateTime.makeUnsafe('2024-02-01T00:00:00Z'),
                  weight: Weight.make(190),
                  notes: Notes.make('imported log'),
                  createdAt: DateTime.nowUnsafe(),
                  updatedAt: DateTime.nowUnsafe(),
                }),
              ],
              injectionLogs: [],
              inventory: [],
              schedules: [],
              goals: [],
              settings: new ExportedSettings({ weightUnit: 'kg' }),
            },
          })

          const result = yield* service.importData('user-123', importData)

          expect(result.weightLogs).toBe(1)
          expect(result.settingsUpdated).toBe(true)

          // Verify old data is gone and new data is present
          const exported = yield* service.exportData('user-123')
          expect(exported.data.weightLogs).toHaveLength(1)
          expect(exported.data.weightLogs[0].id).toBe('imported-1')
          expect(exported.data.settings?.weightUnit).toBe('kg')
        }),
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('preserves other user data during import', () =>
        Effect.gen(function* () {
          // Insert data for different user
          yield* insertWeightLog('other-user-1', new Date('2024-01-01'), 180, 'user-456')

          const service = yield* DataExportService

          // Import data for user-123
          const importData = new DataExport({
            version: '1.0.0',
            exportedAt: DateTime.nowUnsafe(),
            data: {
              weightLogs: [
                new WeightLog({
                  id: WeightLogId.make('user123-log'),
                  datetime: DateTime.makeUnsafe('2024-02-01T00:00:00Z'),
                  weight: Weight.make(190),
                  notes: null,
                  createdAt: DateTime.nowUnsafe(),
                  updatedAt: DateTime.nowUnsafe(),
                }),
              ],
              injectionLogs: [],
              inventory: [],
              schedules: [],
              goals: [],
              settings: null,
            },
          })

          yield* service.importData('user-123', importData)

          // Verify other user's data is preserved
          const otherUserExport = yield* service.exportData('user-456')
          expect(otherUserExport.data.weightLogs).toHaveLength(1)
          expect(otherUserExport.data.weightLogs[0].id).toBe('other-user-1')
        }),
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('rolls back replacement when an import row fails', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('existing-1', new Date('2024-01-01'), 200, 'user-123')

          const service = yield* DataExportService
          const now = DateTime.nowUnsafe()
          const duplicateId = WeightLogId.make('duplicate-log')
          const importData = new DataExport({
            version: '1.0.0',
            exportedAt: now,
            data: {
              weightLogs: [
                new WeightLog({
                  id: duplicateId,
                  datetime: DateTime.makeUnsafe('2024-02-01T00:00:00Z'),
                  weight: Weight.make(190),
                  notes: null,
                  createdAt: now,
                  updatedAt: now,
                }),
                new WeightLog({
                  id: duplicateId,
                  datetime: DateTime.makeUnsafe('2024-02-02T00:00:00Z'),
                  weight: Weight.make(191),
                  notes: null,
                  createdAt: now,
                  updatedAt: now,
                }),
              ],
              injectionLogs: [],
              inventory: [],
              schedules: [],
              goals: [],
              settings: null,
            },
          })

          const result = yield* service.importData('user-123', importData).pipe(Effect.result)
          expect(result._tag).toBe('Failure')

          const exported = yield* service.exportData('user-123')
          expect(exported.data.weightLogs.map((log) => log.id)).toEqual(['existing-1'])
        }),
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('rejects injection logs that reference schedules missing from the import', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('existing-1', new Date('2024-01-01'), 200, 'user-123')

          const service = yield* DataExportService
          const now = DateTime.nowUnsafe()
          const importData = new DataExport({
            version: '1.0.0',
            exportedAt: now,
            data: {
              weightLogs: [],
              injectionLogs: [
                new InjectionLog({
                  id: InjectionLogId.make('inj-1'),
                  datetime: DateTime.makeUnsafe('2024-02-01T00:00:00Z'),
                  drug: DrugName.make('Testosterone'),
                  source: null,
                  dosage: Dosage.make('100mg'),
                  injectionSite: null,
                  notes: null,
                  scheduleId: InjectionScheduleId.make('missing-schedule'),
                  createdAt: now,
                  updatedAt: now,
                }),
              ],
              inventory: [],
              schedules: [],
              goals: [],
              settings: null,
            },
          })

          const result = yield* service.importData('user-123', importData).pipe(Effect.result)
          expect(result._tag).toBe('Failure')
          if (result._tag === 'Failure') {
            expect(result.failure.message).toContain('references missing schedule')
          }

          const exported = yield* service.exportData('user-123')
          expect(exported.data.weightLogs.map((log) => log.id)).toEqual(['existing-1'])
        }),
      )
    })
  })
})
