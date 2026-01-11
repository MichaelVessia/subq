import * as d3 from 'd3'
import type { ChartDimensions } from '../types.js'

interface RenderGridParams {
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleLinear<number, number>
  dimensions: ChartDimensions
}

export function renderGrid({
  yScale,
  dimensions,
}: RenderGridParams): d3.Selection<SVGGElement, unknown, null, undefined> {
  const g = d3.create('svg:g').attr('class', 'grid') as unknown as d3.Selection<SVGGElement, unknown, null, undefined>

  g.attr('opacity', 0.08)
    .call(
      d3
        .axisLeft(yScale)
        .tickSize(-dimensions.width)
        .tickFormat(() => ''),
    )
    .call((sel) => sel.select('.domain').remove())

  return g
}
