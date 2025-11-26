import { Schema } from 'effect'
import { Count, Percentage, Weight, WeeklyChange } from './Brand.js'

// ============================================
// Dashboard Stats Request
// ============================================

/**
 * Parameters for getting dashboard statistics.
 * Mirrors the time range and zoom capabilities of the frontend.
 */
export class DashboardStatsParams extends Schema.Class<DashboardStatsParams>('DashboardStatsParams')({
  startDate: Schema.optional(Schema.Date),
  endDate: Schema.optional(Schema.Date),
}) {}

// ============================================
// Dashboard Stats Response
// ============================================

/**
 * Pre-computed statistics for the dashboard.
 * Calculated server-side via SQL for efficiency.
 */
export class DashboardStats extends Schema.Class<DashboardStats>('DashboardStats')({
  /** Weight at start of period */
  startWeight: Weight,
  /** Weight at end of period */
  endWeight: Weight,
  /** Absolute change in weight (end - start) */
  totalChange: WeeklyChange,
  /** Percentage change ((end - start) / start * 100) */
  percentChange: Percentage,
  /** Average weekly change in weight */
  weeklyAvg: WeeklyChange,
  /** Number of data points in range */
  dataPointCount: Count,
  /** Start date of the data */
  periodStart: Schema.Date,
  /** End date of the data */
  periodEnd: Schema.Date,
}) {}
