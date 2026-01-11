import type { TrendLine } from '@subq/shared'
import type { DataPoint, InjectionPoint } from '../chart-types.js'

export interface SchedulePeriod {
  scheduleId: string
  scheduleName: string
  drug: string
  startDate: Date
  endDate: Date | null
  phases: {
    order: number
    dosage: string
    startDate: Date
    endDate: Date | null
  }[]
}

export interface DrugDosageFilter {
  drug: string
  dosage: string
}

export interface TooltipState {
  content: React.ReactNode
  position: { x: number; y: number }
}

export interface WeightPointWithDrugDosage {
  date: Date
  weight: number
  notes?: string | null
  color: string
  drug: string | null
  dosage: string | null
}

export interface WeightSegment {
  points: WeightPointWithDrugDosage[]
  color: string
  drug: string | null
  dosage: string | null
}

export interface DosageChange {
  item: InjectionPointOnLine
  x: number
  row: number
  isContext?: boolean
}

export interface InjectionPointOnLine extends InjectionPoint {
  displayDate: Date
  color: string
}

export interface ChartDimensions {
  width: number
  height: number
  totalHeight: number
}

export interface ChartMargin {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ChartScales {
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleLinear<number, number>
  margin: ChartMargin
  dimensions: ChartDimensions
}

export interface PillLayoutResult {
  dosageChanges: DosageChange[]
  maxRow: number
}

export interface WeightTrendChartProps {
  weightData: DataPoint[]
  injectionData: InjectionPoint[]
  schedulePeriods: SchedulePeriod[]
  trendLine: TrendLine | null
  zoomRange: { start: Date; end: Date } | null
  onZoom: (range: { start: Date; end: Date }) => void
  displayWeight: (lbs: number) => number
  unitLabel: string
}
