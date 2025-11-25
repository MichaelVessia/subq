import { FetchHttpClient } from '@effect/platform'
import { RpcClient, RpcSerialization, type RpcGroup } from '@effect/rpc'
import {
  AppRpcs,
  type WeightLogCreate,
  type WeightLogUpdate,
  WeightLogListParams,
  type InjectionLogCreate,
  type InjectionLogUpdate,
  InjectionLogListParams,
} from '@scale/shared'
import { Context, Effect, Layer, ManagedRuntime } from 'effect'

// Define the client type
type AppRpcsType = RpcGroup.Rpcs<typeof AppRpcs>

export class ApiClient extends Context.Tag('@scale/ApiClient')<ApiClient, RpcClient.RpcClient<AppRpcsType>>() {
  static readonly layer = Layer.scoped(ApiClient, RpcClient.make(AppRpcs)).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: 'http://localhost:3001/rpc',
      }),
    ),
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  )
}

export const RpcLive = ApiClient.layer

// Runtime for running effects
const runtime = ManagedRuntime.make(RpcLive)

// Helper to run RPC calls
const runRpc = <A, E>(effect: Effect.Effect<A, E, ApiClient>): Promise<A> => runtime.runPromise(effect)

// Typed RPC client helpers
export const rpcClient = {
  // Weight logs
  weightLog: {
    list: (params: Partial<WeightLogListParams> = {}) =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.WeightLogList(new WeightLogListParams(params))
        }),
      ),
    get: (id: string) =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.WeightLogGet({ id })
        }),
      ),
    create: (data: WeightLogCreate) =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.WeightLogCreate(data)
        }),
      ),
    update: (data: WeightLogUpdate) =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.WeightLogUpdate(data)
        }),
      ),
    delete: (id: string) =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.WeightLogDelete({ id })
        }),
      ),
  },

  // Injection logs
  injectionLog: {
    list: (params: Partial<InjectionLogListParams> = {}) =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.InjectionLogList(new InjectionLogListParams(params))
        }),
      ),
    get: (id: string) =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.InjectionLogGet({ id })
        }),
      ),
    create: (data: InjectionLogCreate) =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.InjectionLogCreate(data)
        }),
      ),
    update: (data: InjectionLogUpdate) =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.InjectionLogUpdate(data)
        }),
      ),
    delete: (id: string) =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.InjectionLogDelete({ id })
        }),
      ),
    getDrugs: () =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.InjectionLogGetDrugs()
        }),
      ),
    getSites: () =>
      runRpc(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.InjectionLogGetSites()
        }),
      ),
  },
}
