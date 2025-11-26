import { FetchHttpClient } from '@effect/platform'
import { RpcClient, RpcSerialization } from '@effect/rpc'
import { AtomRpc } from '@effect-atom/atom-react'
import { AppRpcs, DashboardStatsParams, InjectionLogListParams, StatsParams, WeightLogListParams } from '@scale/shared'
import { Layer } from 'effect'

// FetchHttpClient layer with credentials for auth cookies
const FetchWithCredentials = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { credentials: 'include' })),
)

// Use AtomRpc.Tag for automatic atom integration
export class ApiClient extends AtomRpc.Tag<ApiClient>()('@scale/ApiClient', {
  group: AppRpcs,
  protocol: RpcClient.layerProtocolHttp({
    url: 'http://localhost:3001/rpc',
  }).pipe(Layer.provide(RpcSerialization.layerNdjson), Layer.provide(FetchWithCredentials)),
}) {}

// Reactivity keys for cache invalidation
export const ReactivityKeys = {
  weightLogs: 'weight-logs',
  injectionLogs: 'injection-logs',
  injectionDrugs: 'injection-drugs',
  injectionSites: 'injection-sites',
} as const

// Factory functions for queries (no longer need userId - server gets it from session)
export const createWeightLogListAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query('WeightLogList', new WeightLogListParams({ startDate, endDate, limit: 10000 }), {
    reactivityKeys: [ReactivityKeys.weightLogs],
  })

export const createInjectionLogListAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query('InjectionLogList', new InjectionLogListParams({ startDate, endDate, limit: 10000 }), {
    reactivityKeys: [ReactivityKeys.injectionLogs],
  })

export const InjectionDrugsAtom = ApiClient.query('InjectionLogGetDrugs', undefined, {
  reactivityKeys: [ReactivityKeys.injectionDrugs],
})

export const InjectionSitesAtom = ApiClient.query('InjectionLogGetSites', undefined, {
  reactivityKeys: [ReactivityKeys.injectionSites],
})

// Factory function for dashboard stats
export const createDashboardStatsAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query('GetDashboardStats', new DashboardStatsParams({ startDate, endDate }), {
    reactivityKeys: [ReactivityKeys.weightLogs],
  })

// Stats page atoms
export const createWeightStatsAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query('GetWeightStats', new StatsParams({ startDate, endDate }), {
    reactivityKeys: [ReactivityKeys.weightLogs],
  })

export const createWeightTrendAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query('GetWeightTrend', new StatsParams({ startDate, endDate }), {
    reactivityKeys: [ReactivityKeys.weightLogs],
  })

export const createInjectionSiteStatsAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query('GetInjectionSiteStats', new StatsParams({ startDate, endDate }), {
    reactivityKeys: [ReactivityKeys.injectionLogs],
  })

export const createDosageHistoryAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query('GetDosageHistory', new StatsParams({ startDate, endDate }), {
    reactivityKeys: [ReactivityKeys.injectionLogs],
  })

export const createInjectionFrequencyAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query('GetInjectionFrequency', new StatsParams({ startDate, endDate }), {
    reactivityKeys: [ReactivityKeys.injectionLogs],
  })

export const createDrugBreakdownAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query('GetDrugBreakdown', new StatsParams({ startDate, endDate }), {
    reactivityKeys: [ReactivityKeys.injectionLogs],
  })

export const createInjectionByDayOfWeekAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query('GetInjectionByDayOfWeek', new StatsParams({ startDate, endDate }), {
    reactivityKeys: [ReactivityKeys.injectionLogs],
  })
