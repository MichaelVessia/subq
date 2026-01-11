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

## Design Decisions

These decisions were made during spec interview:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Animations | Static only | No D3 transitions exist in current code |
| Visual verification | Manual comparison | Side-by-side visual check during development |
| Migration approach | Single rewrite | Complete rewrite in one branch |
| Tooltip on data update | Keep stale | Tooltip keeps showing old data until user moves mouse |
| Render function API | Return selections | Functions return D3 selections for orchestrator to append |
| Trend line threshold | 2+ points | Show trend with 2 or more weight entries |
| Unit tests | Test pure logic | Test utils/scales/data transforms, not rendering |
| Pill overflow | Not applicable | Data constraints prevent multiple pills on same day |
| Container size | New hook | Create useContainerSize hook |
| Size target | No strict limit | As long as it's cleaner than before |
| D3 pattern | Enter/update/exit | Use D3 data joins for future extensibility |
| Type exports | Named exports | `export interface X`, `export type Y` |
| File exports | Flexible | Whatever makes sense per file |
| SVG groups | Dedicated groups | Each render function gets its own `<g>` with class name for debugging/z-order |
| Filter state | Keep local | selectedFilter resets on navigation, internal to chart |
| Empty state | Message | Show "No weight data" placeholder when weightData is empty |
| Data hooks | Multiple hooks | Separate: useChartData, usePillLayout, useSegments |
| DOM structure | Improve if needed | Can clean up class names, visual match is sufficient |
| Accessibility | Basic ARIA | Add aria-labels to interactive elements |
| Trend line source | Server-computed | trendLine prop passed in with slope/intercept, component just renders |
| Error handling | Error boundary | Wrap chart in error boundary, show fallback on crash |

## Proposed Refactor

### File Structure

Create `packages/web/src/components/stats/weight-trend-chart/` directory:

```
weight-trend-chart/
├── index.tsx                # Main component (orchestrates)
├── types.ts                 # Shared types (named exports)
├── hooks/
│   ├── use-container-size.ts    # ResizeObserver for container width
│   ├── use-chart-data.ts        # Sorting/filtering weight data
│   ├── use-pill-layout.ts       # Pill row layout computation
│   ├── use-segments.ts          # Weight line segmentation by dosage
│   └── use-chart-scales.ts      # Scale creation (x, y) and margins
├── render/
│   ├── render-grid.ts           # Grid lines
│   ├── render-schedule-bands.ts # Schedule overlay bands
│   ├── render-weight-line.ts    # Weight line segments
│   ├── render-dots.ts           # Weight data points
│   ├── render-pills.ts          # Dosage change pills
│   ├── render-trend.ts          # Trend line
│   └── render-axes.ts           # X/Y axes
├── utils.ts                 # Helpers (getDosageColor, makeDrugDosageKey, etc.)
└── ChartErrorBoundary.tsx   # Error boundary wrapper
```

### Main Component Structure

```typescript
function WeightTrendChart(props: WeightTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, width } = useContainerSize()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<DrugDosageFilter | null>(null)

  // Data transformation hooks (memoized)
  const sortedWeight = useChartData(props.weightData, props.zoomRange)
  const pillLayout = usePillLayout(props.injectionData, props.zoomRange)
  const segments = useSegments(sortedWeight, props.injectionData)

  // Scale computation (memoized)
  const { xScale, yScale, margin, dimensions } = useChartScales(
    sortedWeight,
    width,
    pillLayout.maxRow
  )

  // D3 rendering effect
  useEffect(() => {
    if (!svgRef.current || sortedWeight.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const root = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Each render function appends to its own group
    root.append(() => renderGrid({ xScale, yScale, dimensions }).node())
    root.append(() => renderScheduleBands({ ... }).node())
    root.append(() => renderWeightLine({ ... }).node())
    root.append(() => renderDots({ ... }).node())
    root.append(() => renderPills({ ... }).node())
    root.append(() => renderTrend({ ... }).node())
    root.append(() => renderAxes({ ... }).node())
  }, [/* dependencies */])

  // Empty state
  if (props.weightData.length === 0) {
    return <div className="...">No weight data</div>
  }

  return (
    <div ref={containerRef}>
      <svg ref={svgRef} aria-label="Weight trend chart" />
      {tooltip && <Tooltip {...tooltip} />}
    </div>
  )
}

// Export wrapped in error boundary
export function WeightTrendChartWithErrorBoundary(props: WeightTrendChartProps) {
  return (
    <ChartErrorBoundary fallback={<ChartErrorFallback />}>
      <WeightTrendChart {...props} />
    </ChartErrorBoundary>
  )
}
```

### Render Function Pattern

Render functions use D3 enter/update/exit and return selections:

```typescript
// render-weight-line.ts
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
  const g = d3.create('svg:g').attr('class', 'weight-lines')

  const line = d3.line<DataPoint>()
    .x(d => xScale(d.date))
    .y(d => yScale(d.weight))
    .curve(d3.curveMonotoneX)

  g.selectAll('path')
    .data(segments)
    .join('path')
    .attr('fill', 'none')
    .attr('stroke', d => d.color)
    .attr('stroke-width', 2)
    .attr('d', d => line(d.points))
    .attr('opacity', d => {
      if (!selectedFilter) return 1
      const matches = d.drug === selectedFilter.drug && d.dosage === selectedFilter.dosage
      return matches ? 1 : 0.2
    })

  return g
}
```

## Implementation Steps

1. **Create types.ts** - Extract shared interfaces
2. **Create utils.ts** - Extract helper functions (getDosageColor, makeDrugDosageKey, etc.)
3. **Create useContainerSize hook** - ResizeObserver-based width tracking
4. **Create data hooks** - useChartData, usePillLayout, useSegments
5. **Create useChartScales hook** - Scale and margin computation
6. **Extract render functions** - One file per visual element, returning selections
7. **Create ChartErrorBoundary** - Wrap chart for graceful error handling
8. **Create main component** - Wire together hooks and renders
9. **Add ARIA labels** - Basic accessibility for interactive elements
10. **Test** - Manual visual comparison with original

## Dependencies to Preserve

The current effect depends on:
- `containerWidth`
- `weightData`
- `injectionData`
- `schedulePeriods`
- `trendLine` (server-computed, contains slope/intercept)
- `zoomRange`
- `onZoom`
- `displayWeight`
- `unitLabel`
- `selectedFilter` (internal state)

These become explicit parameters to hooks and render functions.

## Testing Strategy

1. **Manual visual comparison** - Side-by-side before/after screenshots
2. **Unit tests for pure logic**:
   - utils.ts (getDosageColor, makeDrugDosageKey, etc.)
   - useChartScales (scale domain/range calculations)
   - usePillLayout (row assignment algorithm)
   - useSegments (segmentation logic)
3. **Interactive verification**:
   - Tooltip hover shows correct data
   - Brush zoom works
   - Pill click filters correctly
   - Responsive margins adjust at different widths

## Acceptance Criteria

- [ ] Component renders identically to current version (visual comparison)
- [ ] No TypeScript errors or `any` types
- [ ] Each render function < 100 lines
- [ ] Main effect is orchestration only (calls render functions)
- [ ] Tooltip interactions work
- [ ] Brush zoom works
- [ ] Filter clicking works
- [ ] Responsive margins work
- [ ] Empty state shows "No weight data" message
- [ ] Error boundary catches render errors gracefully
- [ ] Basic ARIA labels on interactive elements (dots, pills)
- [ ] Unit tests pass for pure logic (utils, data hooks)
