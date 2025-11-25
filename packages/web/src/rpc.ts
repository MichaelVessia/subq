import { FetchHttpClient } from '@effect/platform'
import { RpcClient, RpcSerialization } from '@effect/rpc'
import { AtomRpc } from '@effect-atom/atom-react'
import { AppRpcs, WeightLogListParams, InjectionLogListParams } from '@scale/shared'
import { Layer } from 'effect'

// Use AtomRpc.Tag for automatic atom integration
export class ApiClient extends AtomRpc.Tag<ApiClient>()('@scale/ApiClient', {
  group: AppRpcs,
  protocol: RpcClient.layerProtocolHttp({
    url: 'http://localhost:3001/rpc',
  }).pipe(Layer.provide(RpcSerialization.layerNdjson), Layer.provide(FetchHttpClient.layer)),
}) {}

// Reactivity keys for cache invalidation
export const ReactivityKeys = {
  weightLogs: 'weight-logs',
  injectionLogs: 'injection-logs',
  injectionDrugs: 'injection-drugs',
  injectionSites: 'injection-sites',
} as const

// Pre-built query atoms for common use cases
export const WeightLogListAtom = ApiClient.query('WeightLogList', new WeightLogListParams({}), {
  reactivityKeys: [ReactivityKeys.weightLogs],
})

export const InjectionLogListAtom = ApiClient.query('InjectionLogList', new InjectionLogListParams({}), {
  reactivityKeys: [ReactivityKeys.injectionLogs],
})

export const InjectionDrugsAtom = ApiClient.query(
  'InjectionLogGetDrugs',
  {},
  {
    reactivityKeys: [ReactivityKeys.injectionDrugs],
  },
)

export const InjectionSitesAtom = ApiClient.query(
  'InjectionLogGetSites',
  {},
  {
    reactivityKeys: [ReactivityKeys.injectionSites],
  },
)
