import { Effect, Layer } from 'effect'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { StatsService, StatsServiceLive } from '../src/stats/stats-service.js'
import { clearTables, insertInjectionLog, insertWeightLog, setupTables, SqliteTestLayer } from './helpers/test-db.js'

const TestLayer = StatsServiceLive.pipe(Layer.provideMerge(SqliteTestLayer))

describe('StatsService', () => {
  describe('getWeightStats', () => {
    it.effect('returns null when no data', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const stats = yield* StatsService
        const result = yield* stats.getWeightStats({}, 'user-123')
        expect(result).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('calculates weight stats correctly', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertWeightLog('w1', new Date('2024-01-01T10:00:00Z'), 200, 'user-123')
        yield* insertWeightLog('w2', new Date('2024-01-08T10:00:00Z'), 195, 'user-123')
        yield* insertWeightLog('w3', new Date('2024-01-15T10:00:00Z'), 190, 'user-123')

        const stats = yield* StatsService
        const result = yield* stats.getWeightStats({}, 'user-123')

        expect(result).not.toBeNull()
        expect(result!.minWeight).toBe(190)
        expect(result!.maxWeight).toBe(200)
        expect(result!.avgWeight).toBe(195)
        expect(result!.entryCount).toBe(3)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('only includes data for the specified user', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertWeightLog('w1', new Date('2024-01-01T10:00:00Z'), 200, 'user-123')
        yield* insertWeightLog('w2', new Date('2024-01-08T10:00:00Z'), 150, 'user-456')

        const stats = yield* StatsService
        const result = yield* stats.getWeightStats({}, 'user-123')

        expect(result).not.toBeNull()
        expect(result!.entryCount).toBe(1)
        expect(result!.minWeight).toBe(200)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getWeightTrend', () => {
    it.effect('returns trend points sorted by date', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertWeightLog('w1', new Date('2024-01-15T10:00:00Z'), 190, 'user-123')
        yield* insertWeightLog('w2', new Date('2024-01-01T10:00:00Z'), 200, 'user-123')
        yield* insertWeightLog('w3', new Date('2024-01-08T10:00:00Z'), 195, 'user-123')

        const stats = yield* StatsService
        const result = yield* stats.getWeightTrend({}, 'user-123')

        expect(result.points.length).toBe(3)
        expect(result.points[0]!.weight).toBe(200) // Jan 1
        expect(result.points[1]!.weight).toBe(195) // Jan 8
        expect(result.points[2]!.weight).toBe(190) // Jan 15
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getInjectionSiteStats', () => {
    it.effect('groups injection sites correctly', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('i1', new Date('2024-01-01T10:00:00Z'), 'Test', '200mg', 'user-123', {
          injectionSite: 'left VG',
        })
        yield* insertInjectionLog('i2', new Date('2024-01-02T10:00:00Z'), 'Test', '200mg', 'user-123', {
          injectionSite: 'right VG',
        })
        yield* insertInjectionLog('i3', new Date('2024-01-03T10:00:00Z'), 'Test', '200mg', 'user-123', {
          injectionSite: 'left VG',
        })
        yield* insertInjectionLog('i4', new Date('2024-01-04T10:00:00Z'), 'Test', '200mg', 'user-123')

        const stats = yield* StatsService
        const result = yield* stats.getInjectionSiteStats({}, 'user-123')

        expect(result.totalInjections).toBe(4)
        expect(result.sites.length).toBe(3)
        expect(result.sites[0]!.site).toBe('left VG')
        expect(result.sites[0]!.count).toBe(2)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getDosageHistory', () => {
    it.effect('extracts dosage values from strings', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('i1', new Date('2024-01-01T10:00:00Z'), 'Test', '200mg', 'user-123')
        yield* insertInjectionLog('i2', new Date('2024-01-02T10:00:00Z'), 'BPC', '250mcg', 'user-123')
        yield* insertInjectionLog('i3', new Date('2024-01-03T10:00:00Z'), 'Test', '0.5ml', 'user-123')

        const stats = yield* StatsService
        const result = yield* stats.getDosageHistory({}, 'user-123')

        expect(result.points.length).toBe(3)
        expect(result.points[0]!.dosageValue).toBe(200)
        expect(result.points[1]!.dosageValue).toBe(250)
        expect(result.points[2]!.dosageValue).toBe(0.5)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getInjectionFrequency', () => {
    it.effect('returns null when no data', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const stats = yield* StatsService
        const result = yield* stats.getInjectionFrequency({}, 'user-123')
        expect(result).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('calculates frequency stats correctly', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('i1', new Date('2024-01-01T10:00:00Z'), 'Test', '200mg', 'user-123')
        yield* insertInjectionLog('i2', new Date('2024-01-04T10:00:00Z'), 'Test', '200mg', 'user-123')
        yield* insertInjectionLog('i3', new Date('2024-01-08T10:00:00Z'), 'Test', '200mg', 'user-123')
        yield* insertInjectionLog('i4', new Date('2024-01-11T10:00:00Z'), 'Test', '200mg', 'user-123')
        yield* insertInjectionLog('i5', new Date('2024-01-15T10:00:00Z'), 'Test', '200mg', 'user-123')

        const stats = yield* StatsService
        const result = yield* stats.getInjectionFrequency({}, 'user-123')

        expect(result).not.toBeNull()
        expect(result!.totalInjections).toBe(5)
        expect(result!.avgDaysBetween).toBe(3.5)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getDrugBreakdown', () => {
    it.effect('groups drugs correctly', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        yield* insertInjectionLog('i1', new Date('2024-01-01T10:00:00Z'), 'Testosterone', '200mg', 'user-123')
        yield* insertInjectionLog('i2', new Date('2024-01-02T10:00:00Z'), 'BPC-157', '250mcg', 'user-123')
        yield* insertInjectionLog('i3', new Date('2024-01-03T10:00:00Z'), 'Testosterone', '200mg', 'user-123')
        yield* insertInjectionLog('i4', new Date('2024-01-04T10:00:00Z'), 'Testosterone', '200mg', 'user-123')

        const stats = yield* StatsService
        const result = yield* stats.getDrugBreakdown({}, 'user-123')

        expect(result.totalInjections).toBe(4)
        expect(result.drugs.length).toBe(2)
        expect(result.drugs[0]!.drug).toBe('Testosterone')
        expect(result.drugs[0]!.count).toBe(3)
        expect(result.drugs[1]!.drug).toBe('BPC-157')
        expect(result.drugs[1]!.count).toBe(1)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getInjectionByDayOfWeek', () => {
    it.effect('groups by day of week correctly in UTC', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        // Monday Jan 1 2024, Tuesday Jan 2, Monday Jan 8
        yield* insertInjectionLog('i1', new Date('2024-01-01T10:00:00Z'), 'Test', '200mg', 'user-123')
        yield* insertInjectionLog('i2', new Date('2024-01-02T10:00:00Z'), 'Test', '200mg', 'user-123')
        yield* insertInjectionLog('i3', new Date('2024-01-08T10:00:00Z'), 'Test', '200mg', 'user-123')

        const stats = yield* StatsService
        const result = yield* stats.getInjectionByDayOfWeek({}, 'user-123')

        expect(result.totalInjections).toBe(3)
        const monday = result.days.find((d) => d.dayOfWeek === 1)
        const tuesday = result.days.find((d) => d.dayOfWeek === 2)
        expect(monday?.count).toBe(2)
        expect(tuesday?.count).toBe(1)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('respects timezone parameter for day of week calculation', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        // Wed Dec 4 2024 at 10:00 PM Eastern = Thu Dec 5 at 03:00 AM UTC
        // Wed Dec 11 2024 at 9:00 PM Eastern = Thu Dec 12 at 02:00 AM UTC
        yield* insertInjectionLog('i1', new Date('2024-12-05T03:00:00Z'), 'Test', '200mg', 'user-123')
        yield* insertInjectionLog('i2', new Date('2024-12-12T02:00:00Z'), 'Test', '200mg', 'user-123')

        const stats = yield* StatsService

        // Without timezone (defaults to UTC), these should be Thursday
        const utcResult = yield* stats.getInjectionByDayOfWeek({}, 'user-123')
        const utcThursday = utcResult.days.find((d) => d.dayOfWeek === 4)
        expect(utcThursday?.count).toBe(2)

        // With America/New_York timezone, these should be Wednesday
        const nyResult = yield* stats.getInjectionByDayOfWeek({ timezone: 'America/New_York' }, 'user-123')
        const nyWednesday = nyResult.days.find((d) => d.dayOfWeek === 3)
        expect(nyWednesday?.count).toBe(2)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('getInjectionFrequency timezone handling', () => {
    it.effect('respects timezone for most frequent day of week', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables
        // 3 Wednesday evenings Eastern (Thursday UTC)
        yield* insertInjectionLog('i1', new Date('2024-12-05T03:00:00Z'), 'Test', '200mg', 'user-123')
        yield* insertInjectionLog('i2', new Date('2024-12-12T02:00:00Z'), 'Test', '200mg', 'user-123')
        yield* insertInjectionLog('i3', new Date('2024-12-19T03:30:00Z'), 'Test', '200mg', 'user-123')

        const stats = yield* StatsService

        // Without timezone, most frequent is Thursday (4)
        const utcResult = yield* stats.getInjectionFrequency({}, 'user-123')
        expect(utcResult?.mostFrequentDayOfWeek).toBe(4)

        // With America/New_York, most frequent is Wednesday (3)
        const nyResult = yield* stats.getInjectionFrequency({ timezone: 'America/New_York' }, 'user-123')
        expect(nyResult?.mostFrequentDayOfWeek).toBe(3)
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
