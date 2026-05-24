import { describe, expect, it } from '@effect/vitest'
import { calculateWeightTrajectory, projectWeightTrajectoryDate } from '@subq/shared'

const weightPoint = (date: string, weight: number) => ({ date: new Date(date), weight })

describe('Weight Trajectory', () => {
  it('returns neutral results without enough points', () => {
    expect(calculateWeightTrajectory([])).toEqual({ regression: null, rateOfChange: 0, trendLine: null })
    expect(calculateWeightTrajectory([weightPoint('2024-01-01T00:00:00Z', 200)])).toEqual({
      regression: null,
      rateOfChange: 0,
      trendLine: null,
    })
  })

  it('returns neutral results when every point has the same timestamp', () => {
    const trajectory = calculateWeightTrajectory([
      weightPoint('2024-01-01T00:00:00Z', 200),
      weightPoint('2024-01-01T00:00:00Z', 195),
    ])

    expect(trajectory.regression).toBeNull()
    expect(trajectory.rateOfChange).toBe(0)
    expect(trajectory.trendLine).toBeNull()
  })

  it('computes a known weekly weight rate and trend line', () => {
    const trajectory = calculateWeightTrajectory([
      weightPoint('2024-01-01T00:00:00Z', 200),
      weightPoint('2024-01-08T00:00:00Z', 195),
      weightPoint('2024-01-15T00:00:00Z', 190),
    ])

    expect(trajectory.rateOfChange).toBeCloseTo(-5)
    const trendLine = trajectory.trendLine
    expect(trendLine).not.toBeNull()
    if (trendLine === null) return

    expect(trendLine.startDate.toISOString()).toBe('2024-01-01T00:00:00.000Z')
    expect(trendLine.startWeight).toBeCloseTo(200)
    expect(trendLine.endDate.toISOString()).toBe('2024-01-15T00:00:00.000Z')
    expect(trendLine.endWeight).toBeCloseTo(190)
  })

  it('computes a known weight rate across irregular intervals', () => {
    const trajectory = calculateWeightTrajectory([
      weightPoint('2024-01-01T00:00:00Z', 200),
      weightPoint('2024-01-03T00:00:00Z', 198),
      weightPoint('2024-01-10T00:00:00Z', 191),
    ])

    expect(trajectory.rateOfChange).toBeCloseTo(-7)
  })

  it('orders points before deriving trend endpoints', () => {
    const trajectory = calculateWeightTrajectory([
      weightPoint('2024-01-15T00:00:00Z', 190),
      weightPoint('2024-01-01T00:00:00Z', 200),
      weightPoint('2024-01-08T00:00:00Z', 195),
    ])
    const trendLine = trajectory.trendLine
    expect(trendLine).not.toBeNull()
    if (trendLine === null) return

    expect(trendLine.startDate.toISOString()).toBe('2024-01-01T00:00:00.000Z')
    expect(trendLine.endDate.toISOString()).toBe('2024-01-15T00:00:00.000Z')
  })

  it('projects a target date from the trajectory rate', () => {
    const projectedDate = projectWeightTrajectoryDate({
      currentWeight: 190,
      targetWeight: 180,
      rateOfChange: -5,
      now: new Date('2024-01-15T00:00:00Z'),
    })

    expect(projectedDate?.toISOString()).toBe('2024-01-29T00:00:00.000Z')
  })

  it('projects now when the target weight is already reached', () => {
    const now = new Date('2024-01-15T00:00:00Z')

    expect(
      projectWeightTrajectoryDate({ currentWeight: 179, targetWeight: 180, rateOfChange: -5, now })?.toISOString(),
    ).toBe('2024-01-15T00:00:00.000Z')
  })

  it('does not project when not losing or beyond the max projection window', () => {
    const now = new Date('2024-01-15T00:00:00Z')

    expect(projectWeightTrajectoryDate({ currentWeight: 190, targetWeight: 180, rateOfChange: 0, now })).toBeNull()
    expect(
      projectWeightTrajectoryDate({
        currentWeight: 190,
        targetWeight: 180,
        rateOfChange: -1,
        now,
        maxProjectionDays: 30,
      }),
    ).toBeNull()
  })
})
