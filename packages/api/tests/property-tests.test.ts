/**
 * Property-based tests for branded type validation.
 * Tests that branded types properly enforce their constraints.
 */
import { describe, expect, it } from '@effect/vitest'
import {
  Count,
  DayOfWeek,
  DaysBetween,
  Frequency,
  InjectionsPerWeek,
  Limit,
  Offset,
  PhaseDurationDays,
  PhaseOrder,
  Weight,
} from '@subq/shared'
import { Effect, Exit, Schema } from 'effect'
import { FastCheck as FC } from 'effect/testing'
import { frequencyToDays } from '../src/schedule/rpc-handlers.js'

/**
 * Helper to run property tests within Effect context.
 * Uses fast-check directly since bun-test-effect doesn't have it.effect.prop.
 */
const runProperty = <A>(arbitrary: FC.Arbitrary<A>, predicate: (value: A) => boolean, numRuns = 100): void => {
  FC.assert(
    FC.property(arbitrary, (value) => predicate(value)),
    { numRuns },
  )
}

describe('Branded Type Property Tests', () => {
  // ============================================
  // Weight - positive number
  // ============================================
  describe('Weight', () => {
    it.effect('accepts any positive number (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Schema.toArbitrary(Weight)
        runProperty(arbitrary, (value) => {
          // Value should be positive
          return value > 0
        })
      }),
    )

    it.effect('rejects zero', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(Weight)(0)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects negative numbers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(Weight)(-1)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // Limit - positive integer
  // ============================================
  describe('Limit', () => {
    it.effect('accepts any positive integer (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Schema.toArbitrary(Limit)
        runProperty(arbitrary, (value) => {
          // Value should be positive integer
          return value > 0 && Number.isInteger(value)
        })
      }),
    )

    it.effect('rejects zero', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(Limit)(0)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects negative integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(Limit)(-5)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects non-integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(Limit)(1.5)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // Offset - non-negative integer
  // ============================================
  describe('Offset', () => {
    it.effect('accepts any non-negative integer (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Schema.toArbitrary(Offset)
        runProperty(arbitrary, (value) => {
          // Value should be non-negative integer
          return value >= 0 && Number.isInteger(value)
        })
      }),
    )

    it.effect('accepts zero', () =>
      Effect.gen(function* () {
        const result = Offset.make(0)
        expect(result).toBe(0)
      }),
    )

    it.effect('rejects negative integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(Offset)(-1)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects non-integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(Offset)(0.5)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // Count - non-negative integer
  // ============================================
  describe('Count', () => {
    it.effect('accepts any non-negative integer (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Schema.toArbitrary(Count)
        runProperty(arbitrary, (value) => {
          // Value should be non-negative integer
          return value >= 0 && Number.isInteger(value)
        })
      }),
    )

    it.effect('accepts zero', () =>
      Effect.gen(function* () {
        const result = Count.make(0)
        expect(result).toBe(0)
      }),
    )

    it.effect('rejects negative integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(Count)(-1)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // DaysBetween - non-negative number
  // ============================================
  describe('DaysBetween', () => {
    it.effect('accepts any non-negative number (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Schema.toArbitrary(DaysBetween)
        runProperty(arbitrary, (value) => {
          // Value should be non-negative
          return value >= 0
        })
      }),
    )

    it.effect('accepts zero', () =>
      Effect.gen(function* () {
        const result = DaysBetween.make(0)
        expect(result).toBe(0)
      }),
    )

    it.effect('accepts fractional days', () =>
      Effect.gen(function* () {
        const result = DaysBetween.make(1.5)
        expect(result).toBe(1.5)
      }),
    )

    it.effect('rejects negative numbers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(DaysBetween)(-1)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // DayOfWeek - integer 0-6
  // ============================================
  describe('DayOfWeek', () => {
    it.effect('accepts integers 0-6 (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Schema.toArbitrary(DayOfWeek)
        runProperty(arbitrary, (value) => {
          // Value should be integer 0-6
          return value >= 0 && value <= 6 && Number.isInteger(value)
        })
      }),
    )

    it.effect('rejects 7', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(DayOfWeek)(7)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects negative', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(DayOfWeek)(-1)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // PhaseOrder - positive integer
  // ============================================
  describe('PhaseOrder', () => {
    it.effect('accepts any positive integer (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Schema.toArbitrary(PhaseOrder)
        runProperty(arbitrary, (value) => {
          // Value should be positive integer
          return value > 0 && Number.isInteger(value)
        })
      }),
    )

    it.effect('rejects zero', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(PhaseOrder)(0)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects negative integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(PhaseOrder)(-1)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // PhaseDurationDays - positive integer
  // ============================================
  describe('PhaseDurationDays', () => {
    it.effect('accepts any positive integer (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Schema.toArbitrary(PhaseDurationDays)
        runProperty(arbitrary, (value) => {
          // Value should be positive integer
          return value > 0 && Number.isInteger(value)
        })
      }),
    )

    it.effect('rejects zero', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(PhaseDurationDays)(0)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects negative integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(PhaseDurationDays)(-1)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // InjectionsPerWeek - non-negative number
  // ============================================
  describe('InjectionsPerWeek', () => {
    it.effect('accepts any non-negative number (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Schema.toArbitrary(InjectionsPerWeek)
        runProperty(arbitrary, (value) => {
          // Value should be non-negative
          return value >= 0
        })
      }),
    )

    it.effect('accepts zero', () =>
      Effect.gen(function* () {
        const result = InjectionsPerWeek.make(0)
        expect(result).toBe(0)
      }),
    )

    it.effect('accepts fractional values', () =>
      Effect.gen(function* () {
        const result = InjectionsPerWeek.make(0.5)
        expect(result).toBe(0.5)
      }),
    )

    it.effect('rejects negative numbers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(InjectionsPerWeek)(-1)
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })
})

// ============================================
// frequencyToDays Property Tests
// ============================================
describe('frequencyToDays Property Tests', () => {
  /**
   * Expected mappings for all frequency variants.
   */
  const expectedDays: Record<typeof Frequency.Type, number> = {
    daily: 1,
    every_3_days: 3,
    weekly: 7,
    every_2_weeks: 14,
    monthly: 30,
  }

  it.effect('returns positive integers for all frequency variants (property test)', () =>
    Effect.gen(function* () {
      const arbitrary = Schema.toArbitrary(Frequency)
      runProperty(arbitrary, (frequency) => {
        const days = frequencyToDays(frequency)
        // Should be positive integer
        return days > 0 && Number.isInteger(days)
      })
    }),
  )

  it.effect('daily returns 1', () =>
    Effect.gen(function* () {
      expect(frequencyToDays('daily')).toBe(1)
    }),
  )

  it.effect('every_3_days returns 3', () =>
    Effect.gen(function* () {
      expect(frequencyToDays('every_3_days')).toBe(3)
    }),
  )

  it.effect('weekly returns 7', () =>
    Effect.gen(function* () {
      expect(frequencyToDays('weekly')).toBe(7)
    }),
  )

  it.effect('every_2_weeks returns 14', () =>
    Effect.gen(function* () {
      expect(frequencyToDays('every_2_weeks')).toBe(14)
    }),
  )

  it.effect('monthly returns 30', () =>
    Effect.gen(function* () {
      expect(frequencyToDays('monthly')).toBe(30)
    }),
  )

  it.effect('all variants map to correct day counts (property test)', () =>
    Effect.gen(function* () {
      const arbitrary = Schema.toArbitrary(Frequency)
      runProperty(arbitrary, (frequency) => {
        const days = frequencyToDays(frequency)
        return days === expectedDays[frequency]
      })
    }),
  )

  it.effect('unknown frequency defaults to 7', () =>
    Effect.gen(function* () {
      expect(frequencyToDays('unknown')).toBe(7)
      expect(frequencyToDays('')).toBe(7)
      expect(frequencyToDays('biweekly')).toBe(7)
    }),
  )
})
