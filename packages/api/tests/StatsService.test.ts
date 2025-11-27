import {
  Count,
  DayOfWeek,
  DayOfWeekCount,
  DaysBetween,
  Dosage,
  DosageHistoryPoint,
  DosageHistoryStats,
  DosageValue,
  DrugBreakdownStats,
  DrugCount,
  DrugName,
  InjectionDayOfWeekStats,
  InjectionFrequencyStats,
  InjectionSite,
  InjectionSiteCount,
  InjectionSiteStats,
  InjectionsPerWeek,
  Weight,
  WeightRateOfChange,
  WeightStats,
  WeightTrendPoint,
  WeightTrendStats,
  type StatsParams,
} from '@subq/shared'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { StatsService } from '../src/stats/stats-service.js'

// ============================================
// Test Layer for StatsService
// ============================================

// In-memory weight data
interface WeightEntry {
  datetime: Date
  weight: number
}

// In-memory injection data
interface InjectionEntry {
  datetime: Date
  drug: string
  dosage: string
  injectionSite: string | null
}

// Test data stores
const weightStore: WeightEntry[] = []
const injectionStore: InjectionEntry[] = []

// Helper to seed weight data
const seedWeightData = (entries: WeightEntry[]) => {
  weightStore.length = 0
  weightStore.push(...entries)
}

// Helper to seed injection data
const seedInjectionData = (entries: InjectionEntry[]) => {
  injectionStore.length = 0
  injectionStore.push(...entries)
}

// Helper to clear all data
const clearData = () => {
  weightStore.length = 0
  injectionStore.length = 0
}

const StatsServiceTest = Layer.sync(StatsService, () => ({
  getWeightStats: (params: StatsParams, _userId: string) =>
    Effect.sync(() => {
      let filtered = weightStore
      if (params.startDate) {
        filtered = filtered.filter((e) => e.datetime >= params.startDate!)
      }
      if (params.endDate) {
        filtered = filtered.filter((e) => e.datetime <= params.endDate!)
      }

      if (filtered.length === 0) return null

      filtered.sort((a, b) => a.datetime.getTime() - b.datetime.getTime())
      const weights = filtered.map((e) => e.weight)
      const min = Math.min(...weights)
      const max = Math.max(...weights)
      const avg = weights.reduce((a, b) => a + b, 0) / weights.length

      const startWeight = filtered[0]!.weight
      const endWeight = filtered[filtered.length - 1]!.weight
      const daysDiff =
        (filtered[filtered.length - 1]!.datetime.getTime() - filtered[0]!.datetime.getTime()) / (1000 * 60 * 60 * 24)
      const weeks = daysDiff / 7
      const rateOfChange = weeks > 0 ? (endWeight - startWeight) / weeks : 0

      return new WeightStats({
        minWeight: Weight.make(min),
        maxWeight: Weight.make(max),
        avgWeight: Weight.make(avg),
        rateOfChange: WeightRateOfChange.make(rateOfChange),
        entryCount: Count.make(filtered.length),
      })
    }),

  getWeightTrend: (params: StatsParams, _userId: string) =>
    Effect.sync(() => {
      let filtered = weightStore
      if (params.startDate) {
        filtered = filtered.filter((e) => e.datetime >= params.startDate!)
      }
      if (params.endDate) {
        filtered = filtered.filter((e) => e.datetime <= params.endDate!)
      }
      filtered.sort((a, b) => a.datetime.getTime() - b.datetime.getTime())

      const points = filtered.map(
        (e) =>
          new WeightTrendPoint({
            date: e.datetime,
            weight: Weight.make(e.weight),
          }),
      )
      return new WeightTrendStats({ points })
    }),

  getInjectionSiteStats: (params: StatsParams, _userId: string) =>
    Effect.sync(() => {
      let filtered = injectionStore
      if (params.startDate) {
        filtered = filtered.filter((e) => e.datetime >= params.startDate!)
      }
      if (params.endDate) {
        filtered = filtered.filter((e) => e.datetime <= params.endDate!)
      }

      const siteCounts = new Map<string, number>()
      for (const entry of filtered) {
        const site = entry.injectionSite ?? 'Unknown'
        siteCounts.set(site, (siteCounts.get(site) ?? 0) + 1)
      }

      const sites = Array.from(siteCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([site, count]) => new InjectionSiteCount({ site: InjectionSite.make(site), count: Count.make(count) }))

      return new InjectionSiteStats({
        sites,
        totalInjections: Count.make(filtered.length),
      })
    }),

  getDosageHistory: (params: StatsParams, _userId: string) =>
    Effect.sync(() => {
      let filtered = injectionStore
      if (params.startDate) {
        filtered = filtered.filter((e) => e.datetime >= params.startDate!)
      }
      if (params.endDate) {
        filtered = filtered.filter((e) => e.datetime <= params.endDate!)
      }
      filtered.sort((a, b) => a.datetime.getTime() - b.datetime.getTime())

      const points = filtered.map((e) => {
        const match = e.dosage.match(/(\d+(?:\.\d+)?)/)
        const dosageValue = match ? Number.parseFloat(match[1]!) : 0
        return new DosageHistoryPoint({
          date: e.datetime,
          dosage: Dosage.make(e.dosage),
          dosageValue: DosageValue.make(dosageValue),
        })
      })
      return new DosageHistoryStats({ points })
    }),

  getInjectionFrequency: (params: StatsParams, _userId: string) =>
    Effect.sync(() => {
      let filtered = injectionStore
      if (params.startDate) {
        filtered = filtered.filter((e) => e.datetime >= params.startDate!)
      }
      if (params.endDate) {
        filtered = filtered.filter((e) => e.datetime <= params.endDate!)
      }

      if (filtered.length === 0) return null

      filtered.sort((a, b) => a.datetime.getTime() - b.datetime.getTime())

      // Calculate avg days between
      let totalDaysBetween = 0
      let intervals = 0
      for (let i = 1; i < filtered.length; i++) {
        const diff = (filtered[i]!.datetime.getTime() - filtered[i - 1]!.datetime.getTime()) / (1000 * 60 * 60 * 24)
        totalDaysBetween += diff
        intervals++
      }
      const avgDaysBetween = intervals > 0 ? totalDaysBetween / intervals : 0

      // Find most frequent day of week
      const dowCounts = new Map<number, number>()
      for (const entry of filtered) {
        const dow = entry.datetime.getDay()
        dowCounts.set(dow, (dowCounts.get(dow) ?? 0) + 1)
      }
      let mostFrequentDow: number | null = null
      let maxCount = 0
      for (const [dow, count] of dowCounts) {
        if (count > maxCount) {
          maxCount = count
          mostFrequentDow = dow
        }
      }

      // Calculate injections per week
      const firstDate = filtered[0]!.datetime
      const lastDate = filtered[filtered.length - 1]!.datetime
      const weeks = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 7)
      const injectionsPerWeek = weeks > 0 ? filtered.length / weeks : filtered.length

      return new InjectionFrequencyStats({
        totalInjections: Count.make(filtered.length),
        avgDaysBetween: DaysBetween.make(avgDaysBetween),
        mostFrequentDayOfWeek: mostFrequentDow !== null ? DayOfWeek.make(mostFrequentDow) : null,
        injectionsPerWeek: InjectionsPerWeek.make(injectionsPerWeek),
      })
    }),

  getDrugBreakdown: (params: StatsParams, _userId: string) =>
    Effect.sync(() => {
      let filtered = injectionStore
      if (params.startDate) {
        filtered = filtered.filter((e) => e.datetime >= params.startDate!)
      }
      if (params.endDate) {
        filtered = filtered.filter((e) => e.datetime <= params.endDate!)
      }

      const drugCounts = new Map<string, number>()
      for (const entry of filtered) {
        drugCounts.set(entry.drug, (drugCounts.get(entry.drug) ?? 0) + 1)
      }

      const drugs = Array.from(drugCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([drug, count]) => new DrugCount({ drug: DrugName.make(drug), count: Count.make(count) }))

      return new DrugBreakdownStats({
        drugs,
        totalInjections: Count.make(filtered.length),
      })
    }),

  getInjectionByDayOfWeek: (params: StatsParams, _userId: string) =>
    Effect.sync(() => {
      let filtered = injectionStore
      if (params.startDate) {
        filtered = filtered.filter((e) => e.datetime >= params.startDate!)
      }
      if (params.endDate) {
        filtered = filtered.filter((e) => e.datetime <= params.endDate!)
      }

      const dowCounts = new Map<number, number>()
      for (const entry of filtered) {
        const dow = entry.datetime.getDay()
        dowCounts.set(dow, (dowCounts.get(dow) ?? 0) + 1)
      }

      const days = Array.from(dowCounts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([dow, count]) => new DayOfWeekCount({ dayOfWeek: DayOfWeek.make(dow), count: Count.make(count) }))

      return new InjectionDayOfWeekStats({
        days,
        totalInjections: Count.make(filtered.length),
      })
    }),
}))

// ============================================
// Tests
// ============================================

describe('StatsService', () => {
  describe('getWeightStats', () => {
    it.effect('returns null when no data', () =>
      Effect.gen(function* () {
        clearData()

        const stats = yield* StatsService
        const result = yield* stats.getWeightStats({}, 'user-123')
        expect(result).toBeNull()
      }).pipe(Effect.provide(StatsServiceTest)),
    )

    it.effect('calculates weight stats correctly', () =>
      Effect.gen(function* () {
        clearData()
        seedWeightData([
          { datetime: new Date('2024-01-01T10:00:00Z'), weight: 200 },
          { datetime: new Date('2024-01-08T10:00:00Z'), weight: 195 },
          { datetime: new Date('2024-01-15T10:00:00Z'), weight: 190 },
        ])

        const stats = yield* StatsService
        const result = yield* stats.getWeightStats({}, 'user-123')

        expect(result).not.toBeNull()
        expect(result!.minWeight).toBe(190)
        expect(result!.maxWeight).toBe(200)
        expect(result!.avgWeight).toBe(195) // (200+195+190)/3
        expect(result!.entryCount).toBe(3)
      }).pipe(Effect.provide(StatsServiceTest)),
    )
  })

  describe('getWeightTrend', () => {
    it.effect('returns trend points sorted by date', () =>
      Effect.gen(function* () {
        clearData()
        seedWeightData([
          { datetime: new Date('2024-01-15T10:00:00Z'), weight: 190 },
          { datetime: new Date('2024-01-01T10:00:00Z'), weight: 200 },
          { datetime: new Date('2024-01-08T10:00:00Z'), weight: 195 },
        ])

        const stats = yield* StatsService
        const result = yield* stats.getWeightTrend({}, 'user-123')

        expect(result.points.length).toBe(3)
        expect(result.points[0]!.weight).toBe(200) // Jan 1
        expect(result.points[1]!.weight).toBe(195) // Jan 8
        expect(result.points[2]!.weight).toBe(190) // Jan 15
      }).pipe(Effect.provide(StatsServiceTest)),
    )
  })

  describe('getInjectionSiteStats', () => {
    it.effect('groups injection sites correctly', () =>
      Effect.gen(function* () {
        clearData()
        seedInjectionData([
          { datetime: new Date('2024-01-01T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: 'left VG' },
          { datetime: new Date('2024-01-02T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: 'right VG' },
          { datetime: new Date('2024-01-03T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: 'left VG' },
          { datetime: new Date('2024-01-04T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: null },
        ])

        const stats = yield* StatsService
        const result = yield* stats.getInjectionSiteStats({}, 'user-123')

        expect(result.totalInjections).toBe(4)
        expect(result.sites.length).toBe(3)
        // Sorted by count descending
        expect(result.sites[0]!.site).toBe('left VG')
        expect(result.sites[0]!.count).toBe(2)
      }).pipe(Effect.provide(StatsServiceTest)),
    )
  })

  describe('getDosageHistory', () => {
    it.effect('extracts dosage values from strings', () =>
      Effect.gen(function* () {
        clearData()
        seedInjectionData([
          { datetime: new Date('2024-01-01T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: null },
          { datetime: new Date('2024-01-02T10:00:00Z'), drug: 'BPC', dosage: '250mcg', injectionSite: null },
          { datetime: new Date('2024-01-03T10:00:00Z'), drug: 'Test', dosage: '0.5ml', injectionSite: null },
        ])

        const stats = yield* StatsService
        const result = yield* stats.getDosageHistory({}, 'user-123')

        expect(result.points.length).toBe(3)
        expect(result.points[0]!.dosageValue).toBe(200)
        expect(result.points[1]!.dosageValue).toBe(250)
        expect(result.points[2]!.dosageValue).toBe(0.5)
      }).pipe(Effect.provide(StatsServiceTest)),
    )
  })

  describe('getInjectionFrequency', () => {
    it.effect('returns null when no data', () =>
      Effect.gen(function* () {
        clearData()

        const stats = yield* StatsService
        const result = yield* stats.getInjectionFrequency({}, 'user-123')
        expect(result).toBeNull()
      }).pipe(Effect.provide(StatsServiceTest)),
    )

    it.effect('calculates frequency stats correctly', () =>
      Effect.gen(function* () {
        clearData()
        // Injections every 3-4 days over 2 weeks
        seedInjectionData([
          { datetime: new Date('2024-01-01T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: null },
          { datetime: new Date('2024-01-04T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: null },
          { datetime: new Date('2024-01-08T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: null },
          { datetime: new Date('2024-01-11T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: null },
          { datetime: new Date('2024-01-15T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: null },
        ])

        const stats = yield* StatsService
        const result = yield* stats.getInjectionFrequency({}, 'user-123')

        expect(result).not.toBeNull()
        expect(result!.totalInjections).toBe(5)
        expect(result!.avgDaysBetween).toBe(3.5) // (3+4+3+4)/4
      }).pipe(Effect.provide(StatsServiceTest)),
    )
  })

  describe('getDrugBreakdown', () => {
    it.effect('groups drugs correctly', () =>
      Effect.gen(function* () {
        clearData()
        seedInjectionData([
          { datetime: new Date('2024-01-01T10:00:00Z'), drug: 'Testosterone', dosage: '200mg', injectionSite: null },
          { datetime: new Date('2024-01-02T10:00:00Z'), drug: 'BPC-157', dosage: '250mcg', injectionSite: null },
          { datetime: new Date('2024-01-03T10:00:00Z'), drug: 'Testosterone', dosage: '200mg', injectionSite: null },
          { datetime: new Date('2024-01-04T10:00:00Z'), drug: 'Testosterone', dosage: '200mg', injectionSite: null },
        ])

        const stats = yield* StatsService
        const result = yield* stats.getDrugBreakdown({}, 'user-123')

        expect(result.totalInjections).toBe(4)
        expect(result.drugs.length).toBe(2)
        // Sorted by count descending
        expect(result.drugs[0]!.drug).toBe('Testosterone')
        expect(result.drugs[0]!.count).toBe(3)
        expect(result.drugs[1]!.drug).toBe('BPC-157')
        expect(result.drugs[1]!.count).toBe(1)
      }).pipe(Effect.provide(StatsServiceTest)),
    )
  })

  describe('getInjectionByDayOfWeek', () => {
    it.effect('groups by day of week correctly', () =>
      Effect.gen(function* () {
        clearData()
        // Monday Jan 1 2024, Tuesday Jan 2, Monday Jan 8
        seedInjectionData([
          { datetime: new Date('2024-01-01T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: null }, // Mon
          { datetime: new Date('2024-01-02T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: null }, // Tue
          { datetime: new Date('2024-01-08T10:00:00Z'), drug: 'Test', dosage: '200mg', injectionSite: null }, // Mon
        ])

        const stats = yield* StatsService
        const result = yield* stats.getInjectionByDayOfWeek({}, 'user-123')

        expect(result.totalInjections).toBe(3)
        // Find Monday (1) and Tuesday (2)
        const monday = result.days.find((d) => d.dayOfWeek === 1)
        const tuesday = result.days.find((d) => d.dayOfWeek === 2)
        expect(monday?.count).toBe(2)
        expect(tuesday?.count).toBe(1)
      }).pipe(Effect.provide(StatsServiceTest)),
    )
  })
})
