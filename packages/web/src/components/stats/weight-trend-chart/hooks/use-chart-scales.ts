import * as d3 from 'd3'
import { useMemo } from 'react'
import type { DataPoint } from '../../chart-types.js'
import type { ChartScales } from '../types.js'
import { PILL_CONSTANTS } from '../utils.js'

export function useChartScales(
  weightData: DataPoint[],
  containerWidth: number,
  maxPillRow: number,
): ChartScales | null {
  return useMemo(() => {
    if (containerWidth === 0 || weightData.length === 0) return null

    const isSmallScreen = containerWidth < 400
    const margin = {
      top: 20,
      right: isSmallScreen ? 10 : 30,
      bottom: 40,
      left: isSmallScreen ? 35 : 60,
    }

    const width = containerWidth - margin.left - margin.right
    const totalHeight = 320
    const height = totalHeight - margin.top - margin.bottom

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(weightData, (d) => d.date) as [Date, Date])
      .range([0, width])

    const weightExtent = d3.extent(weightData, (d) => d.weight) as [number, number]
    const yPaddingBottom = (weightExtent[1] - weightExtent[0]) * 0.1 || 5

    const pillSpacePixels = (maxPillRow + 1) * (PILL_CONSTANTS.HEIGHT + PILL_CONSTANTS.VERTICAL_GAP) + 20
    const pixelsPerUnit = height / (weightExtent[1] - weightExtent[0] + yPaddingBottom * 2 || 10)
    const yPaddingTop = pillSpacePixels / pixelsPerUnit

    const yScale = d3
      .scaleLinear()
      .domain([weightExtent[0] - yPaddingBottom, weightExtent[1] + yPaddingTop])
      .range([height, 0])

    return {
      xScale,
      yScale,
      margin,
      dimensions: { width, height, totalHeight },
    }
  }, [weightData, containerWidth, maxPillRow])
}
