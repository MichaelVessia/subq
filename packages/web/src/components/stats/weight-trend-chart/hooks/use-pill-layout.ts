import * as d3 from 'd3'
import { useMemo } from 'react'
import { getDosageColor } from '../../chart-colors.js'
import type { DataPoint, InjectionPoint } from '../../chart-types.js'
import type { DosageChange, InjectionPointOnLine, PillLayoutResult } from '../types.js'
import { PILL_CONSTANTS } from '../utils.js'

export function usePillLayout(
  weightData: DataPoint[],
  injectionData: InjectionPoint[],
  zoomRange: { start: Date; end: Date } | null,
  containerWidth: number,
): PillLayoutResult {
  return useMemo(() => {
    if (containerWidth === 0 || weightData.length === 0) {
      return { dosageChanges: [], maxRow: 0 }
    }

    const allSortedWeight = [...weightData].sort((a, b) => a.date.getTime() - b.date.getTime())
    const allSortedInjections = [...injectionData].sort((a, b) => a.date.getTime() - b.date.getTime())

    const sortedWeight = zoomRange
      ? allSortedWeight.filter((d) => d.date >= zoomRange.start && d.date <= zoomRange.end)
      : allSortedWeight

    const sortedInjections = zoomRange
      ? allSortedInjections.filter((d) => d.date >= zoomRange.start && d.date <= zoomRange.end)
      : allSortedInjections

    if (sortedWeight.length === 0) {
      return { dosageChanges: [], maxRow: 0 }
    }

    const tempXScale = d3
      .scaleTime()
      .domain(d3.extent(sortedWeight, (d) => d.date) as [Date, Date])
      .range([0, containerWidth - 90])

    const injectionPointsOnLine: InjectionPointOnLine[] = sortedInjections
      .map((inj) => {
        const closestWeight = sortedWeight.reduce((prev, curr) =>
          Math.abs(curr.date.getTime() - inj.date.getTime()) < Math.abs(prev.date.getTime() - inj.date.getTime())
            ? curr
            : prev,
        )
        return {
          ...inj,
          weight: closestWeight.weight,
          displayDate: inj.date,
          color: getDosageColor(inj.dosage),
        }
      })
      .filter((inj) => {
        const dateRange = tempXScale.domain()
        const [start, end] = dateRange
        if (!start || !end) return false
        return inj.displayDate >= start && inj.displayDate <= end
      })

    const dosageChanges: DosageChange[] = []

    if (zoomRange && injectionPointsOnLine.length === 0) {
      const priorInjection = allSortedInjections.filter((inj) => inj.date < zoomRange.start).pop()
      if (priorInjection && sortedWeight.length > 0) {
        const firstWeight = sortedWeight[0]!
        dosageChanges.push({
          item: {
            ...priorInjection,
            weight: firstWeight.weight,
            displayDate: zoomRange.start,
            color: getDosageColor(priorInjection.dosage),
          },
          x: tempXScale(zoomRange.start),
          row: 0,
          isContext: true,
        })
      }
    } else if (zoomRange && injectionPointsOnLine.length > 0) {
      const priorInjection = allSortedInjections.filter((inj) => inj.date < zoomRange.start).pop()
      if (priorInjection && sortedWeight.length > 0) {
        const firstWeight = sortedWeight[0]!
        dosageChanges.push({
          item: {
            ...priorInjection,
            weight: firstWeight.weight,
            displayDate: zoomRange.start,
            color: getDosageColor(priorInjection.dosage),
          },
          x: tempXScale(zoomRange.start),
          row: 0,
          isContext: true,
        })
      }
    }

    let prevDosage = dosageChanges.length > 0 ? dosageChanges[0]!.item.dosage : ''
    for (const inj of injectionPointsOnLine) {
      if (inj.dosage !== prevDosage) {
        dosageChanges.push({
          item: inj,
          x: tempXScale(inj.displayDate),
          row: 0,
        })
        prevDosage = inj.dosage
      }
    }

    let maxRow = 0
    for (let i = 0; i < dosageChanges.length; i++) {
      const change = dosageChanges[i]!
      const occupiedRows: number[] = []
      for (let j = 0; j < i; j++) {
        const prev = dosageChanges[j]!
        if (Math.abs(change.x - prev.x) < PILL_CONSTANTS.WIDTH_SINGLE + PILL_CONSTANTS.MIN_GAP_X) {
          occupiedRows.push(prev.row)
        }
      }
      let row = 0
      while (occupiedRows.includes(row)) row++
      change.row = row
      maxRow = Math.max(maxRow, row)
    }

    return { dosageChanges, maxRow }
  }, [weightData, injectionData, zoomRange, containerWidth])
}
