import { FetchHttpClient } from '@effect/platform'
import { RpcClient, RpcSerialization } from '@effect/rpc'
import { AtomRpc } from '@effect-atom/atom-react'
import {
  AppRpcs,
  InjectionLogListParams,
  type InjectionScheduleId,
  InventoryListParams,
  Limit,
  StatsParams,
  WeightLogListParams,
} from '@subq/shared'
import { DateTime, Layer } from 'effect'

// FetchHttpClient layer with credentials for auth cookies
const FetchWithCredentials = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { credentials: 'include' })),
)

// In production (Fly.io), API is same origin so use relative URL
// In local dev, API runs on different port
const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')

// Use AtomRpc.Tag for automatic atom integration
export class ApiClient extends AtomRpc.Tag<ApiClient>()('@subq/ApiClient', {
  group: AppRpcs,
  protocol: RpcClient.layerProtocolHttp({
    url: `${apiUrl}/rpc`,
  }).pipe(Layer.provide(RpcSerialization.layerNdjson), Layer.provide(FetchWithCredentials)),
}) {}

// Reactivity keys for cache invalidation
export const ReactivityKeys = {
  weightLogs: 'weight-logs',
  injectionLogs: 'injection-logs',
  injectionDrugs: 'injection-drugs',
  injectionSites: 'injection-sites',
  inventory: 'inventory',
  schedule: 'schedule',
  goals: 'goals',
  settings: 'settings',
} as const

// Helper to convert optional Date to DateTime.Utc
const toDateTimeUtc = (date?: Date) => (date ? DateTime.unsafeMake(date) : undefined)

// Factory functions for queries (no longer need userId - server gets it from session)
export const createWeightLogListAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query(
    'WeightLogList',
    new WeightLogListParams({
      startDate: toDateTimeUtc(startDate),
      endDate: toDateTimeUtc(endDate),
      limit: Limit.make(10000),
    }),
    { reactivityKeys: [ReactivityKeys.weightLogs] },
  )

export const createInjectionLogListAtom = (startDate?: Date, endDate?: Date) =>
  ApiClient.query(
    'InjectionLogList',
    new InjectionLogListParams({
      startDate: toDateTimeUtc(startDate),
      endDate: toDateTimeUtc(endDate),
      limit: Limit.make(10000),
    }),
    { reactivityKeys: [ReactivityKeys.injectionLogs] },
  )

export const InjectionDrugsAtom = ApiClient.query('InjectionLogGetDrugs', undefined, {
  reactivityKeys: [ReactivityKeys.injectionDrugs],
})

export const InjectionSitesAtom = ApiClient.query('InjectionLogGetSites', undefined, {
  reactivityKeys: [ReactivityKeys.injectionSites],
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

// Inventory atoms
export const createInventoryListAtom = (status?: 'new' | 'opened' | 'finished') =>
  ApiClient.query('InventoryList', new InventoryListParams({ status }), {
    reactivityKeys: [ReactivityKeys.inventory],
  })

// Active inventory (new or opened) for use in injection form
export const ActiveInventoryAtom = ApiClient.query('InventoryList', new InventoryListParams({}), {
  reactivityKeys: [ReactivityKeys.inventory],
})

// Schedule atoms
export const ScheduleListAtom = ApiClient.query('ScheduleList', undefined, {
  reactivityKeys: [ReactivityKeys.schedule],
})

export const ActiveScheduleAtom = ApiClient.query('ScheduleGetActive', undefined, {
  reactivityKeys: [ReactivityKeys.schedule],
})

export const NextDoseAtom = ApiClient.query('ScheduleGetNextDose', undefined, {
  reactivityKeys: [ReactivityKeys.schedule, ReactivityKeys.injectionLogs],
})

export const LastInjectionSiteAtom = ApiClient.query('InjectionLogGetLastSite', undefined, {
  reactivityKeys: [ReactivityKeys.injectionLogs],
})

export const createScheduleViewAtom = (id: InjectionScheduleId) =>
  ApiClient.query(
    'ScheduleGetView',
    { id },
    {
      reactivityKeys: [ReactivityKeys.schedule, ReactivityKeys.injectionLogs],
    },
  )

// Goals atoms
export const ActiveGoalAtom = ApiClient.query('GoalGetActive', undefined, {
  reactivityKeys: [ReactivityKeys.goals],
})

export const GoalProgressAtom = ApiClient.query('GoalGetProgress', undefined, {
  reactivityKeys: [ReactivityKeys.goals, ReactivityKeys.weightLogs],
})

export const GoalListAtom = ApiClient.query('GoalList', undefined, {
  reactivityKeys: [ReactivityKeys.goals],
})

// Settings atoms
export const UserSettingsAtom = ApiClient.query('UserSettingsGet', undefined, {
  reactivityKeys: [ReactivityKeys.settings],
})
