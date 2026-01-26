/**
 * React hooks for accessing local data layer
 *
 * Provides hook-based access to TuiDataLayer for React components.
 * Initializes the SQLite database connection and runs Effect programs.
 */
import { BunContext } from '@effect/platform-bun'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import type { InjectionLog, InjectionSchedule, InjectionScheduleId, Inventory, WeightLog } from '@subq/shared'
import { Effect, Layer, Option } from 'effect'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TuiDataLayer, type TuiDataLayerService } from './data-layer.js'

// ============================================
// Database Layer Initialization
// ============================================

const makeDbLayer = () => {
  const home = process.env.HOME ?? '~'
  const dbPath = `${home}/.subq/data.db`

  return SqliteClient.layer({ filename: dbPath })
}

/**
 * Create the full TUI data layer.
 * Includes SqliteClient and BunContext.
 */
const TuiLayer = TuiDataLayer.layer.pipe(Layer.provide(makeDbLayer()), Layer.provide(BunContext.layer))

// ============================================
// Effect Runner
// ============================================

/**
 * Run an effect using the TUI data layer.
 */
const runDataLayerEffect = <A, E>(effect: Effect.Effect<A, E, TuiDataLayer>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, TuiLayer))

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
