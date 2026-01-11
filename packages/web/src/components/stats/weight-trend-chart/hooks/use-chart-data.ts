import { useMemo } from 'react'
import type { DataPoint } from '../../chart-types.js'

export function useChartData(weightData: DataPoint[], zoomRange: { start: Date; end: Date } | null): DataPoint[] {
  return useMemo(() => {
    const sorted = [...weightData].sort((a, b) => a.date.getTime() - b.date.getTime())
    if (!zoomRange) return sorted
    return sorted.filter((d) => d.date >= zoomRange.start && d.date <= zoomRange.end)
  }, [weightData, zoomRange])
}
