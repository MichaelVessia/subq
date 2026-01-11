import * as d3 from 'd3'
import type { Dispatch, SetStateAction } from 'react'
import type { DosageChange, DrugDosageFilter, TooltipState } from '../types.js'
import { PILL_CONSTANTS } from '../utils.js'

interface RenderPillsParams {
  dosageChanges: DosageChange[]
  yScale: d3.ScaleLinear<number, number>
  selectedFilter: DrugDosageFilter | null
  setSelectedFilter: Dispatch<SetStateAction<DrugDosageFilter | null>>
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>
}

export function renderPills({
  dosageChanges,
  yScale,
  selectedFilter,
  setSelectedFilter,
  setTooltip,
}: RenderPillsParams): d3.Selection<SVGGElement, unknown, null, undefined> {
  const g = d3.create('svg:g').attr('class', 'dosage-pills') as unknown as d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >

  const formatDate = d3.timeFormat('%b %d, %Y')
  const rowOffset = (row: number) => row * (PILL_CONSTANTS.HEIGHT + PILL_CONSTANTS.VERTICAL_GAP)

  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressTriggered = false
  const LONG_PRESS_DURATION = 500

  const isPillSelected = (d: DosageChange) =>
    !selectedFilter || (d.item.drug === selectedFilter.drug && d.item.dosage === selectedFilter.dosage)

  const injectionGroup = g
    .selectAll('.injection-group')
    .data(dosageChanges)
    .enter()
    .append('g')
    .attr('class', 'injection-group')
    .attr('transform', (d) => `translate(${Math.max(PILL_CONSTANTS.WIDTH_SINGLE / 2, d.x)},${12 + rowOffset(d.row)})`)
    .attr('aria-label', (d) => `${d.item.drug} ${d.item.dosage} on ${formatDate(d.item.displayDate)}`)
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      if (!longPressTriggered) {
        const isTouchClick = (event as PointerEvent).pointerType === 'touch'
        if (isTouchClick) {
          return
        }
        setSelectedFilter((prev: DrugDosageFilter | null) =>
          prev?.drug === d.item.drug && prev?.dosage === d.item.dosage
            ? null
            : { drug: d.item.drug, dosage: d.item.dosage },
        )
        setTooltip(null)
      }
      longPressTriggered = false
    })
    .on('mouseenter', (event, d) => {
      setTooltip({
        content: (
          <div>
            <div className="font-semibold mb-0.5">
              {d.item.drug} {d.item.dosage}
            </div>
            <div className="opacity-70">{formatDate(d.item.displayDate)}</div>
            {!selectedFilter && <div className="mt-1 text-[9px] opacity-50">Click to filter</div>}
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
    .on('touchstart', (event, d) => {
      event.preventDefault()
      longPressTriggered = false
      const touch = event.touches[0]
      setTooltip({
        content: (
          <div>
            <div className="font-semibold mb-0.5">
              {d.item.drug} {d.item.dosage}
            </div>
            <div className="opacity-70">{formatDate(d.item.displayDate)}</div>
            {!selectedFilter && <div className="mt-1 text-[9px] opacity-50">Hold to filter</div>}
          </div>
        ),
        position: { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 },
      })
      longPressTimer = setTimeout(() => {
        longPressTriggered = true
        setSelectedFilter((prev: DrugDosageFilter | null) =>
          prev?.drug === d.item.drug && prev?.dosage === d.item.dosage
            ? null
            : { drug: d.item.drug, dosage: d.item.dosage },
        )
        setTooltip(null)
      }, LONG_PRESS_DURATION)
    })
    .on('touchend', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
      if (!longPressTriggered) {
        setTimeout(() => setTooltip(null), 1500)
      }
    })
    .on('touchmove', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
    })

  injectionGroup
    .append('rect')
    .attr('rx', 10)
    .attr('ry', 10)
    .attr('x', -PILL_CONSTANTS.WIDTH_SINGLE / 2)
    .attr('y', -10)
    .attr('width', PILL_CONSTANTS.WIDTH_SINGLE)
    .attr('height', PILL_CONSTANTS.HEIGHT)
    .attr('fill', (d) => d.item.color)
    .attr('opacity', (d) => (isPillSelected(d) ? 1 : 0.25))

  injectionGroup
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.3em')
    .attr('fill', '#fff')
    .attr('font-size', '10px')
    .attr('font-weight', '600')
    .attr('opacity', (d) => (isPillSelected(d) ? 1 : 0.4))
    .text((d) => d.item.dosage)

  g.selectAll('.injection-line')
    .data(dosageChanges)
    .enter()
    .append('line')
    .attr('class', 'injection-line')
    .attr('x1', (d) => Math.max(PILL_CONSTANTS.WIDTH_SINGLE / 2, d.x))
    .attr('x2', (d) => Math.max(PILL_CONSTANTS.WIDTH_SINGLE / 2, d.x))
    .attr('y1', (d) => 20 + rowOffset(d.row))
    .attr('y2', (d) => yScale(d.item.weight))
    .attr('stroke', (d) => d.item.color)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,3')
    .attr('opacity', (d) => (isPillSelected(d) ? 0.4 : 0.1))

  return g
}
