import { Schema } from 'effect'

// ============================================
// Dashboard Stats Request
// ============================================

/**
 * Parameters for getting dashboard statistics.
 * Mirrors the time range and zoom capabilities of the frontend.
 */
export class DashboardStatsParams extends Schema.Class<DashboardStatsParams>('DashboardStatsParams')({
  userId: Schema.String,
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
  startWeight: Schema.Number,
  /** Weight at end of period */
  endWeight: Schema.Number,
  /** Absolute change in weight (end - start) */
  totalChange: Schema.Number,
  /** Percentage change ((end - start) / start * 100) */
  percentChange: Schema.Number,
  /** Average weekly change in weight */
  weeklyAvg: Schema.Number,
  /** Number of data points in range */
  dataPointCount: Schema.Number,
  /** Start date of the data */
  periodStart: Schema.Date,
  /** End date of the data */
  periodEnd: Schema.Date,
}) {}
