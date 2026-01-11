import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useContainerSize } from '../../../hooks/use-container-size.js'
import { Tooltip } from '../tooltip.js'
import { ChartErrorBoundary, ChartErrorFallback } from './ChartErrorBoundary.js'
import { useChartData } from './hooks/use-chart-data.js'
import { useChartScales } from './hooks/use-chart-scales.js'
import { usePillLayout } from './hooks/use-pill-layout.js'
import { useSegments } from './hooks/use-segments.js'
import { renderAxes, renderBrush } from './render/render-axes.js'
import { renderDots } from './render/render-dots.js'
import { renderGrid } from './render/render-grid.js'
import { renderPills } from './render/render-pills.js'
import { renderScheduleBands } from './render/render-schedule-bands.js'
import { renderTrend } from './render/render-trend.js'
import { renderWeightLine } from './render/render-weight-line.js'
import type { DrugDosageFilter, TooltipState, WeightTrendChartProps } from './types.js'

function WeightTrendChart({
  weightData,
  injectionData,
  schedulePeriods,
  trendLine,
  zoomRange,
  onZoom,
  displayWeight,
  unitLabel,
}: WeightTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, width: containerWidth } = useContainerSize<HTMLDivElement>()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<DrugDosageFilter | null>(null)

  const sortedWeight = useChartData(weightData, zoomRange)
  const allSortedWeight = useMemo(
    () => [...weightData].sort((a, b) => a.date.getTime() - b.date.getTime()),
    [weightData],
  )
  const pillLayout = usePillLayout(allSortedWeight, injectionData, zoomRange, containerWidth)
  const segments = useSegments(sortedWeight, injectionData)

  const scales = useChartScales(sortedWeight, containerWidth, pillLayout.maxRow)

  useEffect(() => {
    if (!svgRef.current || !scales || sortedWeight.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    svg.attr('width', containerWidth).attr('height', scales.dimensions.totalHeight)

    const root = svg.append('g').attr('transform', `translate(${scales.margin.left},${scales.margin.top})`)

    root.append(() =>
      renderGrid({ xScale: scales.xScale, yScale: scales.yScale, dimensions: scales.dimensions }).node(),
    )
    root.append(() =>
      renderScheduleBands({
        schedulePeriods,
        xScale: scales.xScale,
        dimensions: scales.dimensions,
        setTooltip,
      }).node(),
    )
    root.append(() =>
      renderBrush({
        xScale: scales.xScale,
        yScale: scales.yScale,
        dimensions: scales.dimensions,
        onZoom,
        svg,
      }).node(),
    )
    root.append(() =>
      renderWeightLine({
        segments,
        xScale: scales.xScale,
        yScale: scales.yScale,
        selectedFilter,
      }).node(),
    )
    root.append(() =>
      renderTrend({
        trendLine,
        xScale: scales.xScale,
        yScale: scales.yScale,
        selectedFilter,
        setTooltip,
        displayWeight,
        unitLabel,
      }).node(),
    )
    root.append(() =>
      renderDots({
        weightPoints: segments.flatMap((s) => s.points),
        xScale: scales.xScale,
        yScale: scales.yScale,
        selectedFilter,
        setTooltip,
        displayWeight,
        unitLabel,
      }).node(),
    )
    root.append(() =>
      renderPills({
        dosageChanges: pillLayout.dosageChanges,
        xScale: scales.xScale,
        yScale: scales.yScale,
        selectedFilter,
        setSelectedFilter,
        setTooltip,
      }).node(),
    )
    root.append(() =>
      renderAxes({
        xScale: scales.xScale,
        yScale: scales.yScale,
        dimensions: scales.dimensions,
        unitLabel,
        containerWidth,
      }).node(),
    )
  }, [
    sortedWeight,
    segments,
    pillLayout,
    scales,
    schedulePeriods,
    trendLine,
    selectedFilter,
    containerWidth,
    displayWeight,
    unitLabel,
    onZoom,
    setTooltip,
    setSelectedFilter,
  ])

  if (weightData.length === 0) {
    return <div className="text-muted-foreground h-[320px] flex items-center justify-center">No weight data</div>
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg ref={svgRef} className="block" aria-label="Weight trend chart" />
      <Tooltip content={tooltip?.content} position={tooltip?.position ?? null} />
      {selectedFilter && (
        <button
          type="button"
          onClick={() => setSelectedFilter(null)}
          className="absolute top-2 right-2 text-xs bg-muted/80 hover:bg-muted px-2 py-1 rounded-md text-muted-foreground"
        >
          Clear filter: {selectedFilter.drug} {selectedFilter.dosage}
        </button>
      )}
      {!zoomRange && !selectedFilter && (
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground opacity-60">Drag to zoom</div>
      )}
    </div>
  )
}

export function WeightTrendChartWithErrorBoundary(props: WeightTrendChartProps) {
  return (
    <ChartErrorBoundary fallback={<ChartErrorFallback />}>
      <WeightTrendChart {...props} />
    </ChartErrorBoundary>
  )
}
