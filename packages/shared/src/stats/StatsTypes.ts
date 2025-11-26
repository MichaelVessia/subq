import { Schema } from 'effect'
import { Count, DayOfWeek, DaysBetween } from '../common/Brand.js'
import { Dosage, DosageValue, DrugName, InjectionSite, InjectionsPerWeek } from '../injection/Brand.js'
import { Weight, WeightRateOfChange } from '../weight/Brand.js'

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
  minWeight: Weight,
  /** Maximum weight in period */
  maxWeight: Weight,
  /** Average weight in period */
  avgWeight: Weight,
  /** Rate of change in lbs per week (negative = losing weight) */
  rateOfChange: WeightRateOfChange,
  /** Total number of weight entries */
  entryCount: Count,
}) {}

// ============================================
// Weight Trend Data Point (for line chart)
// ============================================

export class WeightTrendPoint extends Schema.Class<WeightTrendPoint>('WeightTrendPoint')({
  date: Schema.Date,
  weight: Weight,
}) {}

export class WeightTrendStats extends Schema.Class<WeightTrendStats>('WeightTrendStats')({
  points: Schema.Array(WeightTrendPoint),
}) {}

// ============================================
// Injection Site Distribution (for pie chart)
// ============================================

export class InjectionSiteCount extends Schema.Class<InjectionSiteCount>('InjectionSiteCount')({
  site: InjectionSite,
  count: Count,
}) {}

export class InjectionSiteStats extends Schema.Class<InjectionSiteStats>('InjectionSiteStats')({
  sites: Schema.Array(InjectionSiteCount),
  totalInjections: Count,
}) {}

// ============================================
// Dosage History (for line/step chart)
// ============================================

export class DosageHistoryPoint extends Schema.Class<DosageHistoryPoint>('DosageHistoryPoint')({
  date: Schema.Date,
  dosage: Dosage,
  /** Numeric value extracted from dosage string (e.g. 5 from "5mg") */
  dosageValue: DosageValue,
}) {}

export class DosageHistoryStats extends Schema.Class<DosageHistoryStats>('DosageHistoryStats')({
  points: Schema.Array(DosageHistoryPoint),
}) {}

// ============================================
// Injection Frequency Stats
// ============================================

export class InjectionFrequencyStats extends Schema.Class<InjectionFrequencyStats>('InjectionFrequencyStats')({
  /** Total injections in period */
  totalInjections: Count,
  /** Average days between injections */
  avgDaysBetween: DaysBetween,
  /** Most frequent day of week (0=Sun, 6=Sat) */
  mostFrequentDayOfWeek: Schema.NullOr(DayOfWeek),
  /** Injections per week average */
  injectionsPerWeek: InjectionsPerWeek,
}) {}

// ============================================
// Drug Breakdown (for pie chart)
// ============================================

export class DrugCount extends Schema.Class<DrugCount>('DrugCount')({
  drug: DrugName,
  count: Count,
}) {}

export class DrugBreakdownStats extends Schema.Class<DrugBreakdownStats>('DrugBreakdownStats')({
  drugs: Schema.Array(DrugCount),
  totalInjections: Count,
}) {}

// ============================================
// Injection By Day of Week (for pie chart)
// ============================================

export class DayOfWeekCount extends Schema.Class<DayOfWeekCount>('DayOfWeekCount')({
  /** 0=Sunday, 1=Monday, ..., 6=Saturday */
  dayOfWeek: DayOfWeek,
  count: Count,
}) {}

export class InjectionDayOfWeekStats extends Schema.Class<InjectionDayOfWeekStats>('InjectionDayOfWeekStats')({
  days: Schema.Array(DayOfWeekCount),
  totalInjections: Count,
}) {}
