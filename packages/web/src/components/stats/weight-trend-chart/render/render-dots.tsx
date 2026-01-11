import * as d3 from 'd3'
import type { Dispatch, SetStateAction } from 'react'
import type { DrugDosageFilter, TooltipState, WeightPointWithDrugDosage } from '../types.js'

interface RenderDotsParams {
  weightPoints: WeightPointWithDrugDosage[]
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleLinear<number, number>
  selectedFilter: DrugDosageFilter | null
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>
  displayWeight: (lbs: number) => number
  unitLabel: string
}

export function renderDots({
  weightPoints,
  xScale,
  yScale,
  selectedFilter,
  setTooltip,
  displayWeight,
  unitLabel,
}: RenderDotsParams): d3.Selection<SVGGElement, unknown, null, undefined> {
  const g = d3.create('svg:g').attr('class', 'weight-dots') as unknown as d3.Selection<
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

  const formatDate = d3.timeFormat('%b %d, %Y')

  const isPointSelected = (d: WeightPointWithDrugDosage) =>
    !selectedFilter || (d.drug === selectedFilter.drug && d.dosage === selectedFilter.dosage)

  g.selectAll('.weight-point')
    .data(weightPoints)
    .enter()
    .append('circle')
    .attr('class', 'weight-point')
    .attr('cx', (d) => xScale(d.date))
    .attr('cy', (d) => yScale(d.weight))
    .attr('r', (d) => (isPointSelected(d) ? 4 : 2))
    .attr('fill', (d) => d.color)
    .attr('stroke', 'var(--card)')
    .attr('stroke-width', (d) => (isPointSelected(d) ? 2 : 1))
    .attr('opacity', (d) => (isPointSelected(d) ? 1 : 0.15))
    .attr('aria-label', (d) => `${displayWeight(d.weight).toFixed(1)} ${unitLabel} on ${formatDate(d.date)}`)
    .style('cursor', 'pointer')
    .on('mouseenter', function (event, d) {
      d3.select(this).attr('r', 6)
      setTooltip({
        content: (
          <div>
            <div className="font-semibold mb-0.5">
              {displayWeight(d.weight).toFixed(1)} {unitLabel}
            </div>
            <div className="opacity-70">{formatDate(d.date)}</div>
            {d.notes && <div className="mt-1 opacity-80">{d.notes}</div>}
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
    .on('mouseleave', function () {
      d3.select(this).attr('r', 4)
      setTooltip(null)
    })

  return g
}
