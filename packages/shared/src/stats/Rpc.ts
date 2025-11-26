import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema } from 'effect'
import {
  DashboardStats,
  DashboardStatsParams,
  DosageHistoryStats,
  DrugBreakdownStats,
  InjectionDayOfWeekStats,
  InjectionFrequencyStats,
  InjectionSiteStats,
  StatsParams,
  WeightStats,
  WeightTrendStats,
} from './StatsTypes.js'

// ============================================
// Stats RPCs
// ============================================

export const StatsRpcs = RpcGroup.make(
  // Dashboard Stats RPC
  Rpc.make('GetDashboardStats', {
    payload: DashboardStatsParams,
    success: Schema.NullOr(DashboardStats),
  }),

  // Stats Page RPCs
  Rpc.make('GetWeightStats', {
    payload: StatsParams,
    success: Schema.NullOr(WeightStats),
  }),
  Rpc.make('GetWeightTrend', {
    payload: StatsParams,
    success: WeightTrendStats,
  }),
  Rpc.make('GetInjectionSiteStats', {
    payload: StatsParams,
    success: InjectionSiteStats,
  }),
  Rpc.make('GetDosageHistory', {
    payload: StatsParams,
    success: DosageHistoryStats,
  }),
  Rpc.make('GetInjectionFrequency', {
    payload: StatsParams,
    success: Schema.NullOr(InjectionFrequencyStats),
  }),
  Rpc.make('GetDrugBreakdown', {
    payload: StatsParams,
    success: DrugBreakdownStats,
  }),
  Rpc.make('GetInjectionByDayOfWeek', {
    payload: StatsParams,
    success: InjectionDayOfWeekStats,
  }),
)
