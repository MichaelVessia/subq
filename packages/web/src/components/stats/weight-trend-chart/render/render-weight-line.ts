import * as d3 from 'd3'
import type { DataPoint } from '../../chart-types.js'
import type { DrugDosageFilter, WeightSegment } from '../types.js'

interface RenderWeightLineParams {
  segments: WeightSegment[]
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleLinear<number, number>
  selectedFilter: DrugDosageFilter | null
}

export function renderWeightLine({
  segments,
  xScale,
  yScale,
  selectedFilter,
}: RenderWeightLineParams): d3.Selection<SVGGElement, unknown, null, undefined> {
  const g = d3.create('svg:g').attr('class', 'weight-lines') as unknown as d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >

  const line = d3
    .line<DataPoint>()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.weight))
    .curve(d3.curveMonotoneX)

  for (const segment of segments) {
    if (segment.points.length < 2) continue
    const isSegmentSelected =
      !selectedFilter || (segment.drug === selectedFilter.drug && segment.dosage === selectedFilter.dosage)
    g.append('path')
      .datum(segment.points)
      .attr('fill', 'none')
      .attr('stroke', segment.color)
      .attr('stroke-width', isSegmentSelected ? 2 : 1)
      .attr('opacity', isSegmentSelected ? 1 : 0.15)
      .attr('d', line)
  }

  return g
}
