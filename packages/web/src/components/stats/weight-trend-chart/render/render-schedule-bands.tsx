import * as d3 from 'd3'
import type { Dispatch, SetStateAction } from 'react'
import type { ChartDimensions, SchedulePeriod, TooltipState } from '../types.js'

interface RenderScheduleBandsParams {
  schedulePeriods: SchedulePeriod[]
  xScale: d3.ScaleTime<number, number>
  dimensions: ChartDimensions
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>
}

export function renderScheduleBands({
  schedulePeriods,
  xScale,
  dimensions,
  setTooltip,
}: RenderScheduleBandsParams): d3.Selection<SVGGElement, unknown, null, undefined> {
  const g = d3.create('svg:g').attr('class', 'schedule-bands') as unknown as d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  > as d3.Selection<SVGGElement, unknown, null, undefined> as d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  > as d3.Selection<SVGGElement, unknown, null, undefined>
  const backgroundGroup = g.append('g').attr('class', 'schedule-background')
  const hoverGroup = g.append('g').attr('class', 'schedule-hover')

  const formatDate = d3.timeFormat('%b %d, %Y')
  const chartDomain = xScale.domain() as [Date, Date]
  const HOVER_ZONE_HEIGHT = 24

  for (const schedule of schedulePeriods) {
    const scheduleStart = schedule.startDate
    const scheduleEnd = schedule.endDate ?? new Date()
    if (scheduleEnd < chartDomain[0] || scheduleStart > chartDomain[1]) continue

    const visibleStart = new Date(Math.max(scheduleStart.getTime(), chartDomain[0].getTime()))
    const visibleEnd = new Date(Math.min(scheduleEnd.getTime(), chartDomain[1].getTime()))

    const x1 = xScale(visibleStart)
    const x2 = xScale(visibleEnd)
    const bandWidth = x2 - x1

    if (bandWidth < 2) continue

    const bgRect = backgroundGroup
      .append('rect')
      .attr('x', x1)
      .attr('y', 0)
      .attr('width', bandWidth)
      .attr('height', dimensions.height)
      .attr('fill', 'var(--foreground)')
      .attr('fill-opacity', 0.03)
      .attr('stroke', 'var(--foreground)')
      .attr('stroke-opacity', 0.08)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,4')
      .style('pointer-events', 'none')

    if (bandWidth > 40) {
      const maxChars = Math.floor(bandWidth / 6)
      const label = schedule.drug
      const displayLabel = label.length > maxChars ? `${label.slice(0, maxChars - 3)}...` : label

      backgroundGroup
        .append('text')
        .attr('x', x1 + bandWidth / 2)
        .attr('y', dimensions.height - 8)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '9px')
        .attr('opacity', 0.5)
        .style('pointer-events', 'none')
        .text(displayLabel)
    }

    hoverGroup
      .append('rect')
      .attr('x', x1)
      .attr('y', dimensions.height - HOVER_ZONE_HEIGHT)
      .attr('width', bandWidth)
      .attr('height', HOVER_ZONE_HEIGHT)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('mouseenter', (event) => {
        bgRect.attr('fill-opacity', 0.08).attr('stroke-opacity', 0.2)

        const phasesDisplay = schedule.phases.map((p) => p.dosage).join(' → ')
        setTooltip({
          content: (
            <div>
              <div className="font-semibold mb-1">{schedule.scheduleName}</div>
              <div className="text-[10px] opacity-80 mb-1">{schedule.drug}</div>
              <div className="text-[10px] opacity-70">
                {formatDate(schedule.startDate)} — {schedule.endDate ? formatDate(schedule.endDate) : 'ongoing'}
              </div>
              <div className="mt-1.5 text-[10px] opacity-90">{phasesDisplay}</div>
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
      .on('mouseleave', () => {
        bgRect.attr('fill-opacity', 0.03).attr('stroke-opacity', 0.08)
        setTooltip(null)
      })
  }

  return g
}
