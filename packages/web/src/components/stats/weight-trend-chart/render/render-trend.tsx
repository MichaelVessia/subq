import type { TrendLine } from '@subq/shared'
import * as d3 from 'd3'
import type { Dispatch, SetStateAction } from 'react'
import type { DrugDosageFilter, TooltipState } from '../types.js'

interface RenderTrendParams {
  trendLine: TrendLine | null
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleLinear<number, number>
  selectedFilter: DrugDosageFilter | null
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>
  displayWeight: (lbs: number) => number
  unitLabel: string
}

export function renderTrend({
  trendLine,
  xScale,
  yScale,
  selectedFilter,
  setTooltip,
  displayWeight,
  unitLabel,
}: RenderTrendParams): d3.Selection<SVGGElement, unknown, null, undefined> {
  const g = d3.create('svg:g').attr('class', 'trend-line-group') as unknown as d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >

  if (!trendLine) return g

  const xDomain = xScale.domain() as [Date, Date]
  const trendStartY = trendLine.slope * xDomain[0].getTime() + trendLine.intercept
  const trendEndY = trendLine.slope * xDomain[1].getTime() + trendLine.intercept

  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const lbsPerWeek = trendLine.slope * msPerWeek
  const displayRatePerWeek = displayWeight(Math.abs(lbsPerWeek))
  const direction = lbsPerWeek > 0.01 ? 'gaining' : lbsPerWeek < -0.01 ? 'losing' : 'maintaining'
  const rateText =
    direction === 'maintaining'
      ? 'Maintaining weight'
      : `${direction === 'gaining' ? '+' : '-'}${displayRatePerWeek.toFixed(2)} ${unitLabel}/week`

  g.append('line')
    .attr('class', 'trend-line-hit-area')
    .attr('x1', xScale(xDomain[0]))
    .attr('y1', yScale(trendStartY))
    .attr('x2', xScale(xDomain[1]))
    .attr('y2', yScale(trendEndY))
    .attr('stroke', 'transparent')
    .attr('stroke-width', 12)
    .style('cursor', 'pointer')
    .on('mouseenter', (event) => {
      setTooltip({
        content: (
          <div>
            <div className="font-semibold mb-0.5">Trend Line</div>
            <div className="opacity-90">{rateText}</div>
            <div className="text-[10px] opacity-70 mt-1">
              {displayWeight(trendLine.startWeight).toFixed(1)} → {displayWeight(trendLine.endWeight).toFixed(1)}{' '}
              {unitLabel}
            </div>
          </div>
        ),
        position: { x: event.clientX, y: event.clientY },
      })
    })
    .on('mousemove', (event) => {
      setTooltip((prev: TooltipState | null) =>
        prev ? { ...prev, position: { x: event.clientX, y: event.clientY } } : null,
      )
    })
    .on('mouseleave', () => setTooltip(null))
    .on('click', (event) => {
      setTooltip({
        content: (
          <div>
            <div className="font-semibold mb-0.5">Trend Line</div>
            <div className="opacity-90">{rateText}</div>
            <div className="text-[10px] opacity-70 mt-1">
              {displayWeight(trendLine.startWeight).toFixed(1)} → {displayWeight(trendLine.endWeight).toFixed(1)}{' '}
              {unitLabel}
            </div>
          </div>
        ),
        position: { x: event.clientX, y: event.clientY },
      })
      setTimeout(() => setTooltip(null), 2000)
    })

  g.append('line')
    .attr('class', 'trend-line')
    .attr('x1', xScale(xDomain[0]))
    .attr('y1', yScale(trendStartY))
    .attr('x2', xScale(xDomain[1]))
    .attr('y2', yScale(trendEndY))
    .attr('stroke', 'var(--foreground)')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '8,4')
    .attr('opacity', selectedFilter ? 0.4 : 0.7)
    .style('pointer-events', 'none')

  return g
}
