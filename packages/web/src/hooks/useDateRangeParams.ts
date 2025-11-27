import { useLocation, useRouter } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { TIME_RANGES, type TimeRangeKey } from '../components/shared/chart-utils.js'

export interface DateRange {
  start: Date | undefined
  end: Date | undefined
}

function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]!
}

function getPresetFromRange(start: Date | undefined, end: Date | undefined): TimeRangeKey | null {
  if (!start && !end) return 'all'

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (!end || !start) return null

  // Check if end is today (within same day)
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  if (endDate.getTime() !== today.getTime()) return null

  const diffMs = end.getTime() - start.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  // Allow some tolerance for preset matching
  if (diffDays >= 28 && diffDays <= 32) return '1m'
  if (diffDays >= 88 && diffDays <= 95) return '3m'
  if (diffDays >= 178 && diffDays <= 188) return '6m'
  if (diffDays >= 360 && diffDays <= 370) return '1y'

  return null
}

export function useDateRangeParams() {
  const location = useLocation()
  const router = useRouter()
  const search = location.search as { start?: string; end?: string }

  const range = useMemo(
    (): DateRange => ({
      start: parseDateParam(search.start),
      end: parseDateParam(search.end),
    }),
    [search.start, search.end],
  )

  const setRange = useCallback(
    (newRange: DateRange) => {
      const newSearch = new URLSearchParams()
      if (newRange.start) newSearch.set('start', formatDateParam(newRange.start))
      if (newRange.end) newSearch.set('end', formatDateParam(newRange.end))
      const searchString = newSearch.toString()
      const href = searchString ? `${location.pathname}?${searchString}` : location.pathname
      router.history.push(href)
    },
    [router, location.pathname],
  )

  const setPreset = useCallback(
    (key: TimeRangeKey) => {
      const { startDate, endDate } = TIME_RANGES[key].getRange()
      const newSearch = new URLSearchParams()
      if (startDate) newSearch.set('start', formatDateParam(startDate))
      if (endDate) newSearch.set('end', formatDateParam(endDate))
      const searchString = newSearch.toString()
      const href = searchString ? `${location.pathname}?${searchString}` : location.pathname
      router.history.push(href)
    },
    [router, location.pathname],
  )

  // Determine if current range matches a preset
  const activePreset = useMemo(() => getPresetFromRange(range.start, range.end), [range.start, range.end])

  return {
    range,
    setRange,
    setPreset,
    activePreset,
  }
}
