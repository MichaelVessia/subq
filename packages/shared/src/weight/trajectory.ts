export interface WeightTrajectoryPoint {
  readonly date: Date
  readonly weight: number
}

export interface WeightTrajectoryRegression {
  /** Pounds per millisecond. */
  readonly slope: number
  /** Projected weight at Unix epoch. */
  readonly intercept: number
}

export interface WeightTrajectoryTrendLine extends WeightTrajectoryRegression {
  readonly startDate: Date
  readonly startWeight: number
  readonly endDate: Date
  readonly endWeight: number
}

export interface WeightTrajectory {
  readonly regression: WeightTrajectoryRegression | null
  readonly rateOfChange: number
  readonly trendLine: WeightTrajectoryTrendLine | null
}

export interface WeightTrajectoryProjectionParams {
  readonly currentWeight: number
  readonly targetWeight: number
  readonly rateOfChange: number
  readonly now: Date
  readonly maxProjectionDays?: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
export const WEIGHT_TRAJECTORY_MS_PER_WEEK = 7 * MS_PER_DAY

const neutralWeightTrajectory = (): WeightTrajectory => ({
  regression: null,
  rateOfChange: 0,
  trendLine: null,
})

export const calculateWeightTrajectory = (points: readonly WeightTrajectoryPoint[]): WeightTrajectory => {
  if (points.length < 2) return neutralWeightTrajectory()

  const orderedPoints = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
  const firstPoint = orderedPoints[0]
  const lastPoint = orderedPoints[orderedPoints.length - 1]
  if (firstPoint === undefined || lastPoint === undefined) return neutralWeightTrajectory()

  const epochOffset = firstPoint.date.getTime()
  const pointCount = orderedPoints.length
  const sums = orderedPoints.reduce(
    (accumulator, point) => {
      const x = point.date.getTime() - epochOffset
      return {
        sumX: accumulator.sumX + x,
        sumY: accumulator.sumY + point.weight,
        sumXY: accumulator.sumXY + x * point.weight,
        sumX2: accumulator.sumX2 + x * x,
      }
    },
    { sumX: 0, sumY: 0, sumXY: 0, sumX2: 0 },
  )

  const denominator = pointCount * sums.sumX2 - sums.sumX * sums.sumX
  if (denominator === 0) return neutralWeightTrajectory()

  const slope = (pointCount * sums.sumXY - sums.sumX * sums.sumY) / denominator
  const interceptAtOffset = (sums.sumY - slope * sums.sumX) / pointCount
  const intercept = interceptAtOffset - slope * epochOffset
  const regression = { slope, intercept }
  const startWeight = slope * firstPoint.date.getTime() + intercept
  const endWeight = slope * lastPoint.date.getTime() + intercept

  return {
    regression,
    rateOfChange: slope * WEIGHT_TRAJECTORY_MS_PER_WEEK,
    trendLine: {
      ...regression,
      startDate: firstPoint.date,
      startWeight,
      endDate: lastPoint.date,
      endWeight,
    },
  }
}

export const projectWeightTrajectoryDate = ({
  currentWeight,
  targetWeight,
  rateOfChange,
  now,
  maxProjectionDays,
}: WeightTrajectoryProjectionParams): Date | null => {
  if (currentWeight <= targetWeight) return now
  if (rateOfChange >= 0) return null

  const weeksToTarget = (currentWeight - targetWeight) / Math.abs(rateOfChange)
  const projectedMillis = now.getTime() + weeksToTarget * WEIGHT_TRAJECTORY_MS_PER_WEEK

  if (maxProjectionDays !== undefined && projectedMillis > now.getTime() + maxProjectionDays * MS_PER_DAY) {
    return null
  }

  return new Date(projectedMillis)
}
