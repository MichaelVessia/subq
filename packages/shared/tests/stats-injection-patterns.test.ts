import { describe, expect, it } from '@effect/vitest'
import { buildInjectionDayOfWeekStats, buildObservedInjectionFrequency } from '../src/stats/index.js'

describe('Stats Injection Patterns', () => {
  it('counts day-of-week injection pattern in the requested timezone', () => {
    const result = buildInjectionDayOfWeekStats(
      [new Date('2024-12-05T03:00:00Z'), new Date('2024-12-12T02:00:00Z'), new Date('2024-12-12T15:00:00Z')],
      'America/New_York',
    )

    expect(result.totalInjections).toBe(3)
    expect(result.days.map((day) => [day.dayOfWeek, day.count])).toEqual([
      [3, 2],
      [4, 1],
    ])
  })

  it('builds observed injection frequency from sorted injection datetimes', () => {
    const result = buildObservedInjectionFrequency([
      new Date('2024-01-15T10:00:00Z'),
      new Date('2024-01-01T10:00:00Z'),
      new Date('2024-01-08T10:00:00Z'),
      new Date('2024-01-11T10:00:00Z'),
      new Date('2024-01-04T10:00:00Z'),
    ])

    expect(result?.totalInjections).toBe(5)
    expect(result?.avgDaysBetween).toBe(3.5)
    expect(result?.injectionsPerWeek).toBe(2.5)
    expect(result?.mostFrequentDayOfWeek).toBe(1)
  })

  it('uses the lowest day-of-week when most frequent day is tied', () => {
    const result = buildObservedInjectionFrequency([new Date('2024-01-02T10:00:00Z'), new Date('2024-01-01T10:00:00Z')])

    expect(result?.mostFrequentDayOfWeek).toBe(1)
  })

  it('returns null frequency when no injections exist', () => {
    expect(buildObservedInjectionFrequency([])).toBeNull()
  })
})
