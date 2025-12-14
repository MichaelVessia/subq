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
  TrendLine,
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

// Linear regression helpers (mirrors the ones in stats-service.ts)
interface LinearRegressionResult {
  slope: number
  intercept: number
}

function computeLinearRegression(points: { date: Date; weight: number }[]): LinearRegressionResult | null {
  if (points.length < 2) return null

  const n = points.length
  const sumX = points.reduce((acc, p) => acc + p.date.getTime(), 0)
  const sumY = points.reduce((acc, p) => acc + p.weight, 0)
  const sumXY = points.reduce((acc, p) => acc + p.date.getTime() * p.weight, 0)
  const sumX2 = points.reduce((acc, p) => acc + p.date.getTime() * p.date.getTime(), 0)

  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) return null

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  return { slope, intercept }
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

/**
 * Gets the day of week (0=Sunday, 6=Saturday) for a date in a specific timezone.
 */
function getDayOfWeekInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  })
  const weekdayStr = formatter.format(date)
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return dayMap[weekdayStr] ?? 0
}

function computeRateOfChange(points: { date: Date; weight: number }[]): number {
  const regression = computeLinearRegression(points)
  if (!regression) return 0
  return regression.slope * MS_PER_WEEK
}

function computeTrendLine(points: WeightTrendPoint[]): TrendLine | null {
  const regression = computeLinearRegression(points)
  if (!regression || points.length < 2) return null

  const { slope, intercept } = regression
  const startDate = points[0]!.date
  const endDate = points[points.length - 1]!.date
  const startWeight = slope * startDate.getTime() + intercept
  const endWeight = slope * endDate.getTime() + intercept

  return new TrendLine({
    slope,
    intercept,
    startDate,
    startWeight: Weight.make(startWeight),
    endDate,
    endWeight: Weight.make(endWeight),
  })
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

      // Use linear regression for rate of change (same as trend line)
      const points = filtered.map((e) => ({ date: e.datetime, weight: e.weight }))
      const rateOfChange = computeRateOfChange(points)

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

      // Calculate linear regression trend line
      const trendLine = computeTrendLine(points)

      return new WeightTrendStats({ points, trendLine })
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
          drug: DrugName.make(e.drug),
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

      // Find most frequent day of week (timezone-aware)
      const timezone = params.timezone ?? 'UTC'
      const dowCounts = new Map<number, number>()
      for (const entry of filtered) {
        const dow = getDayOfWeekInTimezone(entry.datetime, timezone)
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

      // Use timezone-aware day of week calculation
      const timezone = params.timezone ?? 'UTC'
      const dowCounts = new Map<number, number>()
      for (const entry of filtered) {
        const dow = getDayOfWeekInTimezone(entry.datetime, timezone)
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

    it.effect('returns null trendLine when fewer than 2 points', () =>
      Effect.gen(function* () {
        clearData()
        seedWeightData([{ datetime: new Date('2024-01-01T10:00:00Z'), weight: 200 }])

        const stats = yield* StatsService
        const result = yield* stats.getWeightTrend({}, 'user-123')

        expect(result.points.length).toBe(1)
        expect(result.trendLine).toBeNull()
      }).pipe(Effect.provide(StatsServiceTest)),
    )

    it.effect('returns trendLine with correct slope for downward trend', () =>
      Effect.gen(function* () {
        clearData()
        // Perfect linear decline: -5 lbs per week
        seedWeightData([
          { datetime: new Date('2024-01-01T00:00:00Z'), weight: 200 },
          { datetime: new Date('2024-01-08T00:00:00Z'), weight: 195 },
          { datetime: new Date('2024-01-15T00:00:00Z'), weight: 190 },
        ])

        const stats = yield* StatsService
        const result = yield* stats.getWeightTrend({}, 'user-123')

        expect(result.trendLine).not.toBeNull()
        // Slope is in lbs per millisecond, convert to lbs per week
        const msPerWeek = 7 * 24 * 60 * 60 * 1000
        const lbsPerWeek = result.trendLine!.slope * msPerWeek
        expect(lbsPerWeek).toBeCloseTo(-5, 1)

        // Start/end weights should match the regression line
        expect(result.trendLine!.startWeight).toBeCloseTo(200, 1)
        expect(result.trendLine!.endWeight).toBeCloseTo(190, 1)
      }).pipe(Effect.provide(StatsServiceTest)),
    )

    it.effect('returns trendLine with correct slope for upward trend', () =>
      Effect.gen(function* () {
        clearData()
        // Perfect linear increase: +3 lbs per week
        seedWeightData([
          { datetime: new Date('2024-01-01T00:00:00Z'), weight: 180 },
          { datetime: new Date('2024-01-08T00:00:00Z'), weight: 183 },
          { datetime: new Date('2024-01-15T00:00:00Z'), weight: 186 },
        ])

        const stats = yield* StatsService
        const result = yield* stats.getWeightTrend({}, 'user-123')

        expect(result.trendLine).not.toBeNull()
        const msPerWeek = 7 * 24 * 60 * 60 * 1000
        const lbsPerWeek = result.trendLine!.slope * msPerWeek
        expect(lbsPerWeek).toBeCloseTo(3, 1)
      }).pipe(Effect.provide(StatsServiceTest)),
    )

    it.effect('handles flat trend (no change)', () =>
      Effect.gen(function* () {
        clearData()
        seedWeightData([
          { datetime: new Date('2024-01-01T00:00:00Z'), weight: 185 },
          { datetime: new Date('2024-01-08T00:00:00Z'), weight: 185 },
          { datetime: new Date('2024-01-15T00:00:00Z'), weight: 185 },
        ])

        const stats = yield* StatsService
        const result = yield* stats.getWeightTrend({}, 'user-123')

        expect(result.trendLine).not.toBeNull()
        expect(result.trendLine!.slope).toBeCloseTo(0, 10)
        expect(result.trendLine!.startWeight).toBeCloseTo(185, 1)
        expect(result.trendLine!.endWeight).toBeCloseTo(185, 1)
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
