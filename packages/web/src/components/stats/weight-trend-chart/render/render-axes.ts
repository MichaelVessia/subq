import * as d3 from 'd3'
import type { ChartDimensions } from '../types.js'

interface RenderAxesParams {
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleLinear<number, number>
  dimensions: ChartDimensions
  unitLabel: string
  containerWidth: number
  onZoom: (range: { start: Date; end: Date }) => void
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
}

export function renderBrush({
  xScale,
  dimensions,
  onZoom,
  svg,
}: Omit<RenderAxesParams, 'yScale' | 'unitLabel' | 'containerWidth'>): d3.Selection<
  SVGGElement,
  unknown,
  null,
  undefined
> {
  const g = d3.create('svg:g').attr('class', 'brush-layer') as unknown as d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >

  const brush = d3
    .brushX()
    .extent([
      [0, 0],
      [dimensions.width, dimensions.height],
    ])
    .filter((event: MouseEvent) => {
      const target = event.target as Element | null
      if (!target) return true
      return !target.closest('.weight-point, .injection-group, .trend-line-hit-area, .schedule-hover')
    })
    .on('end', (event) => {
      if (!event.selection) return
      const [x0, x1] = event.selection as [number, number]
      const newStart = xScale.invert(x0)
      const newEnd = xScale.invert(x1)
      svg.select('.brush').call(brush.move as never, null)
      onZoom({ start: newStart, end: newEnd })
    })

  const brushGroup = g.append('g').attr('class', 'brush').call(brush)
  brushGroup.selectAll('rect').attr('rx', 3).attr('ry', 3)

  brushGroup
    .select('.selection')
    .attr('fill', 'var(--foreground)')
    .attr('fill-opacity', 0.1)
    .attr('stroke', 'var(--foreground)')
    .attr('stroke-opacity', 0.3)

  return g
}

export function renderAxes({
  xScale,
  yScale,
  dimensions,
  unitLabel,
  containerWidth,
}: Omit<RenderAxesParams, 'onZoom' | 'svg'>): d3.Selection<SVGGElement, unknown, null, undefined> {
  const g = d3.create('svg:g').attr('class', 'axes') as unknown as d3.Selection<SVGGElement, unknown, null, undefined>
  const isSmallScreen = containerWidth < 400

  g.append('g')
    .attr('transform', `translate(0,${dimensions.height})`)
    .call(
      d3
        .axisBottom(xScale)
        .ticks(isSmallScreen ? 3 : 5)
        .tickFormat(d3.timeFormat('%b %d') as (d: d3.NumberValue) => string),
    )
    .call((sel) => sel.select('.domain').attr('stroke', '#e5e7eb'))
    .call((sel) => sel.selectAll('.tick line').attr('stroke', '#e5e7eb'))
    .call((sel) =>
      sel
        .selectAll('.tick text')
        .attr('fill', '#9ca3af')
        .attr('font-size', isSmallScreen ? '9px' : '11px'),
    )

  g.append('g')
    .call(d3.axisLeft(yScale).ticks(isSmallScreen ? 4 : 5))
    .call((sel) => sel.select('.domain').remove())
    .call((sel) => sel.selectAll('.tick line').remove())
    .call((sel) =>
      sel
        .selectAll('.tick text')
        .attr('fill', '#9ca3af')
        .attr('font-size', isSmallScreen ? '9px' : '11px'),
    )

  if (!isSmallScreen) {
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -40)
      .attr('x', -dimensions.height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9ca3af')
      .attr('font-size', '11px')
      .text(`Weight (${unitLabel})`)
  }

  return g
}
