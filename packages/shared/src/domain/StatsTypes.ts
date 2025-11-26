import { Schema } from 'effect'

// ============================================
// Stats Request Params (shared across stats endpoints)
// ============================================

export class StatsParams extends Schema.Class<StatsParams>('StatsParams')({
  startDate: Schema.optional(Schema.Date),
  endDate: Schema.optional(Schema.Date),
}) {}

// ============================================
// Weight Stats Response
// ============================================

export class WeightStats extends Schema.Class<WeightStats>('WeightStats')({
  /** Minimum weight in period */
  minWeight: Schema.Number,
  /** Maximum weight in period */
  maxWeight: Schema.Number,
  /** Average weight in period */
  avgWeight: Schema.Number,
  /** Rate of change in lbs per week (negative = losing weight) */
  rateOfChange: Schema.Number,
  /** Total number of weight entries */
  entryCount: Schema.Number,
}) {}

// ============================================
// Weight Trend Data Point (for line chart)
// ============================================

export class WeightTrendPoint extends Schema.Class<WeightTrendPoint>('WeightTrendPoint')({
  date: Schema.Date,
  weight: Schema.Number,
}) {}

export class WeightTrendStats extends Schema.Class<WeightTrendStats>('WeightTrendStats')({
  points: Schema.Array(WeightTrendPoint),
}) {}

// ============================================
// Injection Site Distribution (for pie chart)
// ============================================

export class InjectionSiteCount extends Schema.Class<InjectionSiteCount>('InjectionSiteCount')({
  site: Schema.String,
  count: Schema.Number,
}) {}

export class InjectionSiteStats extends Schema.Class<InjectionSiteStats>('InjectionSiteStats')({
  sites: Schema.Array(InjectionSiteCount),
  totalInjections: Schema.Number,
}) {}

// ============================================
// Dosage History (for line/step chart)
// ============================================

export class DosageHistoryPoint extends Schema.Class<DosageHistoryPoint>('DosageHistoryPoint')({
  date: Schema.Date,
  dosage: Schema.String,
  /** Numeric value extracted from dosage string (e.g. 5 from "5mg") */
  dosageValue: Schema.Number,
}) {}

export class DosageHistoryStats extends Schema.Class<DosageHistoryStats>('DosageHistoryStats')({
  points: Schema.Array(DosageHistoryPoint),
}) {}

// ============================================
// Injection Frequency Stats
// ============================================

export class InjectionFrequencyStats extends Schema.Class<InjectionFrequencyStats>('InjectionFrequencyStats')({
  /** Total injections in period */
  totalInjections: Schema.Number,
  /** Average days between injections */
  avgDaysBetween: Schema.Number,
  /** Most frequent day of week (0=Sun, 6=Sat) */
  mostFrequentDayOfWeek: Schema.NullOr(Schema.Number),
  /** Injections per week average */
  injectionsPerWeek: Schema.Number,
}) {}

// ============================================
// Drug Breakdown (for pie chart)
// ============================================

export class DrugCount extends Schema.Class<DrugCount>('DrugCount')({
  drug: Schema.String,
  count: Schema.Number,
}) {}

export class DrugBreakdownStats extends Schema.Class<DrugBreakdownStats>('DrugBreakdownStats')({
  drugs: Schema.Array(DrugCount),
  totalInjections: Schema.Number,
}) {}

// ============================================
// Injection By Day of Week (for pie chart)
// ============================================

export class DayOfWeekCount extends Schema.Class<DayOfWeekCount>('DayOfWeekCount')({
  /** 0=Sunday, 1=Monday, ..., 6=Saturday */
  dayOfWeek: Schema.Number,
  count: Schema.Number,
}) {}

export class InjectionDayOfWeekStats extends Schema.Class<InjectionDayOfWeekStats>('InjectionDayOfWeekStats')({
  days: Schema.Array(DayOfWeekCount),
  totalInjections: Schema.Number,
}) {}
