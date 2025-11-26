import { useCallback, useEffect, useMemo, useState } from 'react'
import { TIME_RANGES, type TimeRangeKey } from '../components/shared/chartUtils.js'

export interface DateRange {
  start: Date | undefined
  end: Date | undefined
}

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]!
}

function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
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

function getParamsFromUrl(): { start: Date | undefined; end: Date | undefined } {
  const params = new URLSearchParams(window.location.search)
  return {
    start: parseDateParam(params.get('start')),
    end: parseDateParam(params.get('end')),
  }
}

function updateUrl(start: Date | undefined, end: Date | undefined) {
  const params = new URLSearchParams(window.location.search)

  if (start) {
    params.set('start', formatDateParam(start))
  } else {
    params.delete('start')
  }

  if (end) {
    params.set('end', formatDateParam(end))
  } else {
    params.delete('end')
  }

  const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname

  window.history.pushState({}, '', newUrl)
}

export function useDateRangeParams() {
  const [range, setRangeState] = useState<DateRange>(() => getParamsFromUrl())

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      setRangeState(getParamsFromUrl())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const setRange = useCallback((newRange: DateRange) => {
    setRangeState(newRange)
    updateUrl(newRange.start, newRange.end)
  }, [])

  const setPreset = useCallback((key: TimeRangeKey) => {
    const { startDate, endDate } = TIME_RANGES[key].getRange()
    setRangeState({ start: startDate, end: endDate })
    updateUrl(startDate, endDate)
  }, [])

  // Determine if current range matches a preset
  const activePreset = useMemo(() => getPresetFromRange(range.start, range.end), [range.start, range.end])

  return {
    range,
    setRange,
    setPreset,
    activePreset,
  }
}
