import { FetchHttpClient } from '@effect/platform'
import { RpcClient, RpcSerialization } from '@effect/rpc'
import { Atom, AtomRpc } from '@effect-atom/atom-react'
import {
  AppRpcs,
  InjectionLogListParams,
  type InjectionScheduleId,
  InventoryListParams,
  Limit,
  StatsParams,
  WeightLogListParams,
} from '@subq/shared'
import { DateTime, Layer, Option } from 'effect'

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
  cliSessions: 'cli-sessions',
} as const

// Helper to convert optional Date to DateTime.Utc
const toDateTimeUtc = (date?: Date) => (date ? DateTime.unsafeMake(date) : undefined)

/**
 * Creates a stable string key from optional start/end dates for use with Atom.family.
 * Returns empty string for undefined dates.
 */
export const dateRangeKey = (startDate: Date | undefined, endDate: Date | undefined): string => {
  const start = startDate ? startDate.toISOString() : ''
  const end = endDate ? endDate.toISOString() : ''
  return `${start}|${end}`
}

/**
 * Parses a date range key back into optional start/end dates.
 * Returns [undefined, undefined] for empty or invalid keys.
 */
export const parseDateRangeKey = (key: string): [Date | undefined, Date | undefined] => {
  const [startStr, endStr] = key.split('|')
  const start = startStr ? Option.fromNullable(new Date(startStr)).pipe(Option.getOrUndefined) : undefined
  const end = endStr ? Option.fromNullable(new Date(endStr)).pipe(Option.getOrUndefined) : undefined
  return [start, end]
}

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

// Get the browser's timezone for stats that need it
const getBrowserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// Stats page atom families (keyed by date range)
export const WeightStatsAtomFamily = Atom.family((key: string) => {
  const [start, end] = parseDateRangeKey(key)
  return ApiClient.query('GetWeightStats', new StatsParams({ startDate: start, endDate: end }), {
    reactivityKeys: [ReactivityKeys.weightLogs],
  })
})

export const WeightTrendAtomFamily = Atom.family((key: string) => {
  const [start, end] = parseDateRangeKey(key)
  return ApiClient.query('GetWeightTrend', new StatsParams({ startDate: start, endDate: end }), {
    reactivityKeys: [ReactivityKeys.weightLogs],
  })
})

export const InjectionLogListAtomFamily = Atom.family((key: string) => {
  const [start, end] = parseDateRangeKey(key)
  return ApiClient.query(
    'InjectionLogList',
    new InjectionLogListParams({
      startDate: toDateTimeUtc(start),
      endDate: toDateTimeUtc(end),
      limit: Limit.make(10000),
    }),
    { reactivityKeys: [ReactivityKeys.injectionLogs] },
  )
})

export const InjectionSiteStatsAtomFamily = Atom.family((key: string) => {
  const [start, end] = parseDateRangeKey(key)
  return ApiClient.query('GetInjectionSiteStats', new StatsParams({ startDate: start, endDate: end }), {
    reactivityKeys: [ReactivityKeys.injectionLogs],
  })
})

export const DosageHistoryAtomFamily = Atom.family((key: string) => {
  const [start, end] = parseDateRangeKey(key)
  return ApiClient.query('GetDosageHistory', new StatsParams({ startDate: start, endDate: end }), {
    reactivityKeys: [ReactivityKeys.injectionLogs],
  })
})

export const InjectionFrequencyAtomFamily = Atom.family((key: string) => {
  const [start, end] = parseDateRangeKey(key)
  return ApiClient.query(
    'GetInjectionFrequency',
    new StatsParams({ startDate: start, endDate: end, timezone: getBrowserTimezone() }),
    { reactivityKeys: [ReactivityKeys.injectionLogs] },
  )
})

export const DrugBreakdownAtomFamily = Atom.family((key: string) => {
  const [start, end] = parseDateRangeKey(key)
  return ApiClient.query('GetDrugBreakdown', new StatsParams({ startDate: start, endDate: end }), {
    reactivityKeys: [ReactivityKeys.injectionLogs],
  })
})

export const InjectionByDayOfWeekAtomFamily = Atom.family((key: string) => {
  const [start, end] = parseDateRangeKey(key)
  return ApiClient.query(
    'GetInjectionByDayOfWeek',
    new StatsParams({ startDate: start, endDate: end, timezone: getBrowserTimezone() }),
    { reactivityKeys: [ReactivityKeys.injectionLogs] },
  )
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

// CLI Sessions atom
export const CliSessionsAtom = ApiClient.query('CliSessionList', undefined, {
  reactivityKeys: [ReactivityKeys.cliSessions],
})

// Data operation state types for export/import
export type DataOperationState =
  | { readonly _tag: 'idle' }
  | { readonly _tag: 'pending' }
  | { readonly _tag: 'success'; readonly message: string }
  | { readonly _tag: 'error'; readonly message: string }

// Writable atoms for data operation states
export const exportOperationAtom: Atom.Writable<DataOperationState> = Atom.make<DataOperationState>({ _tag: 'idle' })
export const importOperationAtom: Atom.Writable<DataOperationState> = Atom.make<DataOperationState>({ _tag: 'idle' })
