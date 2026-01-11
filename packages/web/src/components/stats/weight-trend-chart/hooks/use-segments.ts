import { useMemo } from 'react'
import { getDosageColor } from '../../chart-colors.js'
import type { DataPoint, InjectionPoint } from '../../chart-types.js'
import type { WeightPointWithDrugDosage, WeightSegment } from '../types.js'
import { makeDrugDosageKey } from '../utils.js'

export function useSegments(weightData: DataPoint[], allInjectionData: InjectionPoint[]): WeightSegment[] {
  return useMemo(() => {
    const sortedWeight = [...weightData].sort((a, b) => a.date.getTime() - b.date.getTime())
    const allSortedInjections = [...allInjectionData].sort((a, b) => a.date.getTime() - b.date.getTime())

    const weightPointsWithColors: WeightPointWithDrugDosage[] = sortedWeight.map((wp) => {
      const recentInjection = allSortedInjections.filter((inj) => inj.date.getTime() <= wp.date.getTime()).pop()
      const color = recentInjection
        ? getDosageColor(makeDrugDosageKey(recentInjection.drug, recentInjection.dosage))
        : '#94a3b8'
      return {
        ...wp,
        color,
        drug: recentInjection?.drug ?? null,
        dosage: recentInjection?.dosage ?? null,
      }
    })

    const segments: WeightSegment[] = []
    let currentSegment: WeightPointWithDrugDosage[] = []
    let currentColor = ''
    let currentDrug: string | null = null
    let currentDosage: string | null = null

    for (const point of weightPointsWithColors) {
      if (point.color !== currentColor) {
        if (currentSegment.length > 0) {
          segments.push({
            points: currentSegment,
            color: currentColor,
            drug: currentDrug,
            dosage: currentDosage,
          })
          const lastPoint = currentSegment[currentSegment.length - 1]
          if (lastPoint) currentSegment = [lastPoint]
        }
        currentColor = point.color
        currentDrug = point.drug
        currentDosage = point.dosage
      }
      currentSegment.push(point)
    }

    if (currentSegment.length > 0) {
      segments.push({
        points: currentSegment,
        color: currentColor,
        drug: currentDrug,
        dosage: currentDosage,
      })
    }

    return segments
  }, [weightData, allInjectionData])
}
