# WeightTrendChart Refactor Spec

## Problem

The `WeightTrendChart` component in `packages/web/src/components/stats/StatsPage.tsx:170-920` has several maintainability issues:

1. **Monolithic useEffect** (~400 lines) handling all D3 rendering
2. **10+ dependencies** in the effect dependency array
3. **~750 lines** in a single component
4. **Mixed concerns**: data transformation, scale computation, rendering, interactivity

## Current Structure

```
WeightTrendChart
├── State: tooltip, selectedFilter
├── useEffect (massive)
│   ├── Data sorting and filtering
│   ├── Pill row layout computation
│   ├── Margin/dimension calculation
│   ├── Scale creation (x, y)
│   ├── Grid rendering
│   ├── Schedule overlay bands
│   ├── Weight point color assignment
│   ├── Line segment computation
│   ├── Brush (zoom) setup
│   ├── Axis rendering
│   ├── Line path rendering
│   ├── Weight dots with tooltips
│   ├── Injection dosage pills
│   └── Trend line rendering
└── JSX (minimal)
```

## Proposed Refactor

### Phase 1: Extract Rendering Module

Create `packages/web/src/components/stats/weight-trend-chart/` directory:

```
weight-trend-chart/
├── index.tsx           # Main component (orchestrates)
├── types.ts            # Shared types
├── scales.ts           # Scale creation utilities
├── render-grid.ts      # Grid lines rendering
├── render-schedule-bands.ts   # Schedule overlay bands
├── render-weight-line.ts      # Weight line segments
├── render-dots.ts      # Weight data points
├── render-pills.ts     # Dosage change pills
├── render-trend.ts     # Trend line
├── render-axes.ts      # X/Y axes
└── utils.ts            # Helpers (color assignment, segmentation)
```

### Phase 2: Break Down the Effect

Transform the monolithic effect into focused hooks:

```typescript
// Main component becomes orchestrator
function WeightTrendChart(props: WeightTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, width } = useContainerSize()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<DrugDosageFilter | null>(null)

  // Computed data (memoized)
  const { sortedWeight, sortedInjections, pillRows } = useChartData(
    props.weightData,
    props.injectionData,
    props.zoomRange
  )

  // Scale computation (memoized)
  const { xScale, yScale, margin, dimensions } = useChartScales(
    sortedWeight,
    width,
    pillRows.maxRow
  )

  // D3 rendering (single effect, calls individual render functions)
  useChartRenderer({
    svgRef,
    sortedWeight,
    sortedInjections,
    xScale,
    yScale,
    margin,
    dimensions,
    schedulePeriods: props.schedulePeriods,
    trendLine: props.trendLine,
    displayWeight: props.displayWeight,
    unitLabel: props.unitLabel,
    onZoom: props.onZoom,
    setTooltip,
    selectedFilter,
    setSelectedFilter,
  })

  return (
    <div ref={containerRef}>
      <svg ref={svgRef} />
      {tooltip && <Tooltip {...tooltip} />}
    </div>
  )
}
```

### Phase 3: Extract Render Functions

Each render function follows a consistent pattern:

```typescript
// render-weight-line.ts
interface RenderWeightLineParams {
  g: d3.Selection<SVGGElement, unknown, null, undefined>
  segments: WeightSegment[]
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleLinear<number, number>
  selectedFilter: DrugDosageFilter | null
}

export function renderWeightLine({
  g,
  segments,
  xScale,
  yScale,
  selectedFilter,
}: RenderWeightLineParams): void {
  const line = d3.line<DataPoint>()
    .x(d => xScale(d.date))
    .y(d => yScale(d.weight))
    .curve(d3.curveMonotoneX)

  const pathGroup = g.append('g').attr('class', 'weight-lines')

  for (const segment of segments) {
    const isFilteredOut = selectedFilter &&
      (segment.drug !== selectedFilter.drug || segment.dosage !== selectedFilter.dosage)

    pathGroup.append('path')
      .datum(segment.points)
      .attr('fill', 'none')
      .attr('stroke', segment.color)
      .attr('stroke-width', 2)
      .attr('d', line)
      .attr('opacity', isFilteredOut ? 0.2 : 1)
  }
}
```

## Implementation Steps

1. **Create types.ts** - Extract shared interfaces
2. **Create utils.ts** - Extract helper functions (getDosageColor, makeDrugDosageKey, etc.)
3. **Create scales.ts** - Extract scale computation logic
4. **Extract render functions** - One file per visual element
5. **Create useChartData hook** - Data sorting/filtering/transformation
6. **Create useChartRenderer hook** - Orchestrates render functions
7. **Refactor main component** - Wire together hooks and render
8. **Test** - Verify visual output matches original

## Dependencies to Preserve

The current effect depends on:
- `containerWidth`
- `weightData`
- `injectionData`
- `schedulePeriods`
- `trendLine`
- `zoomRange`
- `onZoom`
- `displayWeight`
- `unitLabel`
- `selectedFilter` (internal state)

These should become explicit parameters to the render hooks.

## Testing Strategy

1. Visual regression testing with screenshots before/after
2. Verify tooltip interactions work
3. Verify zoom/brush behavior
4. Verify filter (click on pill) behavior
5. Verify responsive behavior at different widths

## Acceptance Criteria

- [ ] Component renders identically to current version
- [ ] No TypeScript errors or `any` types
- [ ] Each render function < 100 lines
- [ ] Main effect < 50 lines (just orchestration)
- [ ] Tooltip interactions work
- [ ] Brush zoom works
- [ ] Filter clicking works
- [ ] Responsive margins work
