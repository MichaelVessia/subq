/**
 * React hooks for accessing local data layer
 *
 * Provides hook-based access to TuiDataLayer for React components.
 * Initializes the SQLite database connection and runs Effect programs.
 * Write operations use LocalDb.writeWithOutbox for sync support.
 */
import { BunContext } from '@effect/platform-bun'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { LocalDb } from '@subq/local'
import type {
  InjectionLog,
  InjectionLogCreate,
  InjectionLogId,
  InjectionLogUpdate,
  InjectionSchedule,
  InjectionScheduleId,
  Inventory,
  InventoryCreate,
  InventoryId,
  InventoryUpdate,
  WeightLog,
  WeightLogCreate,
  WeightLogId,
  WeightLogUpdate,
} from '@subq/shared'
import { Effect, Layer, Option } from 'effect'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TuiDataLayer, type TuiDataLayerService } from './data-layer.js'
import { TuiWriteLayer, type TuiWriteLayerService } from './write-layer.js'

// ============================================
// Database Layer Initialization
// ============================================

const makeDbLayer = () => {
  const home = process.env.HOME ?? '~'
  const dbPath = `${home}/.subq/data.db`

  return SqliteClient.layer({ filename: dbPath })
}

/**
 * Create the full TUI data layer (reads).
 * Includes SqliteClient and BunContext.
 */
const TuiReadLayer = TuiDataLayer.layer.pipe(Layer.provide(makeDbLayer()), Layer.provide(BunContext.layer))

/**
 * Create the full TUI write layer.
 * Includes LocalDb, SqliteClient and BunContext.
 */
const TuiWriteDbLayer = TuiWriteLayer.layer.pipe(
  Layer.provide(LocalDb.layer),
  Layer.provide(makeDbLayer()),
  Layer.provide(BunContext.layer),
)

// ============================================
// Effect Runner
// ============================================

/**
 * Run an effect using the TUI data layer (reads).
 */
const runDataLayerEffect = <A, E>(effect: Effect.Effect<A, E, TuiDataLayer>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, TuiReadLayer))

/**
 * Run an effect using the TUI write layer.
 */
const runWriteLayerEffect = <A, E>(effect: Effect.Effect<A, E, TuiWriteLayer>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, TuiWriteDbLayer))

// ============================================
// Hook: useLocalData
// ============================================

interface UseLocalDataOptions {
  onError?: (message: string) => void
}

interface UseLocalDataResult<T> {
  data: T | undefined
  loading: boolean
  reload: () => Promise<void>
}

/**
 * Generic hook for loading data from the local database.
 *
 * @param fetcher - Function that returns an Effect to fetch data
 * @param options - Configuration with onError callback
 */
export function useLocalData<T>(
  fetcher: (service: TuiDataLayerService) => Effect.Effect<T>,
  options: UseLocalDataOptions = {},
): UseLocalDataResult<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  // Use refs to avoid re-fetching when callback references change
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const onErrorRef = useRef(options.onError)
  onErrorRef.current = options.onError

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await runDataLayerEffect(
        Effect.gen(function* () {
          const service = yield* TuiDataLayer
          return yield* fetcherRef.current(service)
        }),
      )
      setData(result)
    } catch (err) {
      onErrorRef.current?.(`Failed to load: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, reload: load }
}

// ============================================
// Specialized Hooks
// ============================================

/**
 * Load weight logs from local database.
 */
export function useWeightLogs(options: UseLocalDataOptions = {}): UseLocalDataResult<ReadonlyArray<WeightLog>> {
  return useLocalData((service) => service.listWeightLogs({ limit: 100 }), options)
}

/**
 * Load injection logs from local database.
 */
export function useInjectionLogs(options: UseLocalDataOptions = {}): UseLocalDataResult<ReadonlyArray<InjectionLog>> {
  return useLocalData((service) => service.listInjectionLogs({ limit: 100 }), options)
}

/**
 * Load inventory items from local database.
 */
export function useInventory(
  filterOptions: { status?: string } = {},
  options: UseLocalDataOptions = {},
): UseLocalDataResult<ReadonlyArray<Inventory>> {
  const { status } = filterOptions
  // Only pass status if defined
  return useLocalData((service) => service.listInventory(status !== undefined ? { status } : {}), options)
}

/**
 * Load injection schedules from local database.
 */
export function useSchedules(options: UseLocalDataOptions = {}): UseLocalDataResult<ReadonlyArray<InjectionSchedule>> {
  return useLocalData((service) => service.listSchedules(), options)
}

/**
 * Load distinct drug names from local database.
 */
export function useDistinctDrugs(options: UseLocalDataOptions = {}): UseLocalDataResult<ReadonlyArray<string>> {
  return useLocalData((service) => service.getDistinctDrugs(), options)
}

/**
 * Load distinct injection sites from local database.
 */
export function useDistinctSites(options: UseLocalDataOptions = {}): UseLocalDataResult<ReadonlyArray<string>> {
  return useLocalData((service) => service.getDistinctSites(), options)
}

/**
 * Get a single schedule by ID.
 */
export function useSchedule(
  id: InjectionScheduleId,
  options: UseLocalDataOptions = {},
): UseLocalDataResult<Option.Option<InjectionSchedule>> {
  return useLocalData((service) => service.getSchedule(id), options)
}

// ============================================
// Write Hooks
// ============================================

/**
 * Generic hook for write operations that go through LocalDb.writeWithOutbox.
 * Returns a function that performs the write and handles errors.
 */
export function useLocalWrite<TInput, TResult>(
  writer: (service: TuiWriteLayerService, input: TInput) => Effect.Effect<TResult>,
  options: UseLocalDataOptions = {},
): (input: TInput) => Promise<TResult> {
  const onErrorRef = useRef(options.onError)
  onErrorRef.current = options.onError

  return useCallback(
    async (input: TInput) => {
      try {
        return await runWriteLayerEffect(
          Effect.gen(function* () {
            const service = yield* TuiWriteLayer
            return yield* writer(service, input)
          }),
        )
      } catch (err) {
        const message = `Write failed: ${err instanceof Error ? err.message : 'Unknown'}`
        onErrorRef.current?.(message)
        throw err
      }
    },
    [writer],
  )
}

// ============================================
// Weight Log Write Hooks
// ============================================

/**
 * Create a weight log entry in local database.
 */
export function useCreateWeightLog(
  options: UseLocalDataOptions = {},
): (data: WeightLogCreate) => Promise<{ id: WeightLogId }> {
  return useLocalWrite((service, data: WeightLogCreate) => service.createWeightLog(data), options)
}

/**
 * Update a weight log entry in local database.
 */
export function useUpdateWeightLog(options: UseLocalDataOptions = {}): (data: WeightLogUpdate) => Promise<void> {
  return useLocalWrite((service, data: WeightLogUpdate) => service.updateWeightLog(data), options)
}

/**
 * Delete a weight log entry from local database.
 */
export function useDeleteWeightLog(options: UseLocalDataOptions = {}): (id: WeightLogId) => Promise<void> {
  return useLocalWrite((service, id: WeightLogId) => service.deleteWeightLog(id), options)
}

// ============================================
// Injection Log Write Hooks
// ============================================

/**
 * Create an injection log entry in local database.
 */
export function useCreateInjectionLog(
  options: UseLocalDataOptions = {},
): (data: InjectionLogCreate) => Promise<{ id: InjectionLogId }> {
  return useLocalWrite((service, data: InjectionLogCreate) => service.createInjectionLog(data), options)
}

/**
 * Update an injection log entry in local database.
 */
export function useUpdateInjectionLog(options: UseLocalDataOptions = {}): (data: InjectionLogUpdate) => Promise<void> {
  return useLocalWrite((service, data: InjectionLogUpdate) => service.updateInjectionLog(data), options)
}

/**
 * Delete an injection log entry from local database.
 */
export function useDeleteInjectionLog(options: UseLocalDataOptions = {}): (id: InjectionLogId) => Promise<void> {
  return useLocalWrite((service, id: InjectionLogId) => service.deleteInjectionLog(id), options)
}

// ============================================
// Inventory Write Hooks
// ============================================

/**
 * Create an inventory item in local database.
 */
export function useCreateInventory(
  options: UseLocalDataOptions = {},
): (data: InventoryCreate) => Promise<{ id: InventoryId }> {
  return useLocalWrite((service, data: InventoryCreate) => service.createInventory(data), options)
}

/**
 * Update an inventory item in local database.
 */
export function useUpdateInventory(options: UseLocalDataOptions = {}): (data: InventoryUpdate) => Promise<void> {
  return useLocalWrite((service, data: InventoryUpdate) => service.updateInventory(data), options)
}

/**
 * Delete an inventory item from local database.
 */
export function useDeleteInventory(options: UseLocalDataOptions = {}): (id: InventoryId) => Promise<void> {
  return useLocalWrite((service, id: InventoryId) => service.deleteInventory(id), options)
}

/**
 * Mark an inventory item as opened.
 */
export function useMarkInventoryOpened(options: UseLocalDataOptions = {}): (id: InventoryId) => Promise<void> {
  return useLocalWrite((service, id: InventoryId) => service.markInventoryOpened(id), options)
}

/**
 * Mark an inventory item as finished.
 */
export function useMarkInventoryFinished(options: UseLocalDataOptions = {}): (id: InventoryId) => Promise<void> {
  return useLocalWrite((service, id: InventoryId) => service.markInventoryFinished(id), options)
}
