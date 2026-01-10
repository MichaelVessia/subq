import { useCallback, useEffect, useRef, useState } from 'react'

interface UseAsyncDataOptions {
  onError: (message: string) => void
}

interface UseAsyncDataResult<T> {
  data: T | undefined
  loading: boolean
  reload: () => Promise<void>
}

/**
 * Hook for loading async data with loading state and error handling.
 * Uses refs to avoid re-fetching when fetcher function reference changes.
 *
 * @param fetcher - Function that fetches the data
 * @param options - Configuration with onError callback
 * @returns Object with data, loading state, and reload function
 */
export function useAsyncData<T>(fetcher: () => Promise<T>, options: UseAsyncDataOptions): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  // Use refs to always have latest callbacks without causing re-runs
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const onErrorRef = useRef(options.onError)
  onErrorRef.current = options.onError

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetcherRef.current()
      setData(result)
    } catch (err) {
      onErrorRef.current(`Failed to load: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
    setLoading(false)
  }, [])

  // Run once on mount
  useEffect(() => {
    load()
  }, [load])

  return { data, loading, reload: load }
}
