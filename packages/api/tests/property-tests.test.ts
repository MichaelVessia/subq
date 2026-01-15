/**
 * Property-based tests for branded type validation.
 * Tests that branded types properly enforce their constraints.
 */
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import {
  Count,
  DayOfWeek,
  DaysBetween,
  InjectionsPerWeek,
  Limit,
  Offset,
  PhaseDurationDays,
  PhaseOrder,
  Weight,
} from '@subq/shared'
import { Arbitrary, Effect, Either, Schema } from 'effect'
import * as FC from 'effect/FastCheck'

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
        const arbitrary = Arbitrary.make(Weight)
        runProperty(arbitrary, (value) => {
          // Value should be positive
          return value > 0
        })
      }),
    )

    it.effect('rejects zero', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(Weight)(0)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects negative numbers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(Weight)(-1)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // Limit - positive integer
  // ============================================
  describe('Limit', () => {
    it.effect('accepts any positive integer (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Arbitrary.make(Limit)
        runProperty(arbitrary, (value) => {
          // Value should be positive integer
          return value > 0 && Number.isInteger(value)
        })
      }),
    )

    it.effect('rejects zero', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(Limit)(0)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects negative integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(Limit)(-5)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects non-integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(Limit)(1.5)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // Offset - non-negative integer
  // ============================================
  describe('Offset', () => {
    it.effect('accepts any non-negative integer (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Arbitrary.make(Offset)
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
        const result = Schema.decodeUnknownEither(Offset)(-1)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects non-integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(Offset)(0.5)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // Count - non-negative integer
  // ============================================
  describe('Count', () => {
    it.effect('accepts any non-negative integer (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Arbitrary.make(Count)
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
        const result = Schema.decodeUnknownEither(Count)(-1)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // DaysBetween - non-negative number
  // ============================================
  describe('DaysBetween', () => {
    it.effect('accepts any non-negative number (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Arbitrary.make(DaysBetween)
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
        const result = Schema.decodeUnknownEither(DaysBetween)(-1)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // DayOfWeek - integer 0-6
  // ============================================
  describe('DayOfWeek', () => {
    it.effect('accepts integers 0-6 (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Arbitrary.make(DayOfWeek)
        runProperty(arbitrary, (value) => {
          // Value should be integer 0-6
          return value >= 0 && value <= 6 && Number.isInteger(value)
        })
      }),
    )

    it.effect('rejects 7', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(DayOfWeek)(7)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects negative', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(DayOfWeek)(-1)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // PhaseOrder - positive integer
  // ============================================
  describe('PhaseOrder', () => {
    it.effect('accepts any positive integer (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Arbitrary.make(PhaseOrder)
        runProperty(arbitrary, (value) => {
          // Value should be positive integer
          return value > 0 && Number.isInteger(value)
        })
      }),
    )

    it.effect('rejects zero', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(PhaseOrder)(0)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects negative integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(PhaseOrder)(-1)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // PhaseDurationDays - positive integer
  // ============================================
  describe('PhaseDurationDays', () => {
    it.effect('accepts any positive integer (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Arbitrary.make(PhaseDurationDays)
        runProperty(arbitrary, (value) => {
          // Value should be positive integer
          return value > 0 && Number.isInteger(value)
        })
      }),
    )

    it.effect('rejects zero', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(PhaseDurationDays)(0)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects negative integers', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(PhaseDurationDays)(-1)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  // ============================================
  // InjectionsPerWeek - non-negative number
  // ============================================
  describe('InjectionsPerWeek', () => {
    it.effect('accepts any non-negative number (property test)', () =>
      Effect.gen(function* () {
        const arbitrary = Arbitrary.make(InjectionsPerWeek)
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
        const result = Schema.decodeUnknownEither(InjectionsPerWeek)(-1)
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })
})
