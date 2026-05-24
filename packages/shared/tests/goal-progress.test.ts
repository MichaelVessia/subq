import { describe, expect, it } from '@effect/vitest'
import { DateTime } from 'effect'
import { GoalId, UserGoal, Weight } from '../src/index.js'
import { buildGoalProgress, calculateGoalProgressPaceStatus } from '../src/goals/index.js'

const goal = ({
  goalWeight = 180,
  startingWeight = 200,
  startingDate = '2024-01-01T00:00:00Z',
  targetDate = '2024-12-31T00:00:00Z',
}: {
  readonly goalWeight?: number
  readonly startingWeight?: number
  readonly startingDate?: string
  readonly targetDate?: string | null
} = {}) =>
  new UserGoal({
    id: GoalId.make('goal-1'),
    goalWeight: Weight.make(goalWeight),
    startingWeight: Weight.make(startingWeight),
    startingDate: DateTime.makeUnsafe(startingDate),
    targetDate: targetDate === null ? null : DateTime.makeUnsafe(targetDate),
    notes: null,
    isActive: true,
    completedAt: null,
    createdAt: DateTime.makeUnsafe('2024-01-01T00:00:00Z'),
    updatedAt: DateTime.makeUnsafe('2024-01-01T00:00:00Z'),
  })

describe('GoalProgress', () => {
  it('builds projection, pace, and summary fields from a user goal and weight history', () => {
    const now = new Date('2024-01-15T00:00:00Z')
    const progress = buildGoalProgress({
      goal: goal(),
      currentWeight: 190,
      weightHistory: [
        { date: new Date('2024-01-01T00:00:00Z'), weight: 200 },
        { date: new Date('2024-01-08T00:00:00Z'), weight: 195 },
        { date: new Date('2024-01-15T00:00:00Z'), weight: 190 },
      ],
      now,
    })

    expect(progress.currentWeight).toBe(190)
    expect(progress.lbsLost).toBe(10)
    expect(progress.lbsRemaining).toBe(10)
    expect(progress.percentComplete).toBe(50)
    expect(progress.avgLbsPerWeek).toBeCloseTo(5)
    expect(progress.paceStatus).toBe('ahead')
    expect(progress.daysOnPlan).toBe(14)
    expect(progress.projectedDate ? DateTime.toEpochMillis(progress.projectedDate) : null).toBe(
      new Date('2024-01-29T00:00:00.000Z').getTime(),
    )
  })

  it('treats a reached goal as ahead even when recent weight trajectory is flat or gaining', () => {
    const now = new Date('2024-01-15T00:00:00Z')
    const userGoal = goal({ goalWeight: 180 })
    const status = calculateGoalProgressPaceStatus({
      goal: userGoal,
      currentWeight: 179,
      rateOfChange: 1,
      now,
    })
    const progress = buildGoalProgress({
      goal: userGoal,
      currentWeight: 179,
      weightHistory: [
        { date: new Date('2024-01-01T00:00:00Z'), weight: 178 },
        { date: new Date('2024-01-15T00:00:00Z'), weight: 179 },
      ],
      now,
    })

    expect(status).toBe('ahead')
    expect(progress.paceStatus).toBe('ahead')
    expect(progress.lbsRemaining).toBe(0)
    expect(progress.projectedDate ? DateTime.toEpochMillis(progress.projectedDate) : null).toBe(now.getTime())
  })

  it('marks a losing goal without a target date as on track', () => {
    expect(
      calculateGoalProgressPaceStatus({
        goal: goal({ targetDate: null }),
        currentWeight: 190,
        rateOfChange: -1,
        now: new Date('2024-01-15T00:00:00Z'),
      }),
    ).toBe('on_track')
  })
})
