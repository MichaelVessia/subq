/**
 * Unit tests for form schemas.
 * Tests validation logic for form inputs.
 */
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Either, Schema } from 'effect'
import { GoalFormSchema } from './form-schemas.js'

describe('GoalFormSchema', () => {
  describe('valid inputs', () => {
    it.effect('accepts valid input with all fields', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(GoalFormSchema)({
          goalWeight: '150.5',
          startDate: '2024-01-01',
          targetDate: '2024-06-01',
          notes: 'My weight loss goal',
        })
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.goalWeight).toBe('150.5')
          expect(result.right.startDate).toBe('2024-01-01')
          expect(result.right.targetDate).toBe('2024-06-01')
          expect(result.right.notes).toBe('My weight loss goal')
        }
      }),
    )

    it.effect('accepts valid input with only required goalWeight', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(GoalFormSchema)({
          goalWeight: '180',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.goalWeight).toBe('180')
          expect(result.right.startDate).toBe('')
          expect(result.right.targetDate).toBe('')
          expect(result.right.notes).toBe('')
        }
      }),
    )

    it.effect('accepts boundary weight values', () =>
      Effect.gen(function* () {
        // Just above 0
        const minResult = Schema.decodeUnknownEither(GoalFormSchema)({
          goalWeight: '0.1',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Either.isRight(minResult)).toBe(true)

        // At max boundary
        const maxResult = Schema.decodeUnknownEither(GoalFormSchema)({
          goalWeight: '1000',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Either.isRight(maxResult)).toBe(true)
      }),
    )
  })

  describe('missing weight', () => {
    it.effect('rejects empty goalWeight', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(GoalFormSchema)({
          goalWeight: '',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  describe('invalid weight values', () => {
    it.effect('rejects zero weight', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(GoalFormSchema)({
          goalWeight: '0',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects negative weight', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(GoalFormSchema)({
          goalWeight: '-50',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects weight over 1000', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(GoalFormSchema)({
          goalWeight: '1001',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects non-numeric weight', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(GoalFormSchema)({
          goalWeight: 'abc',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  describe('notes handling', () => {
    it.effect('accepts empty notes', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(GoalFormSchema)({
          goalWeight: '150',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.notes).toBe('')
        }
      }),
    )

    it.effect('accepts long notes', () =>
      Effect.gen(function* () {
        const longNotes = 'This is a very long note '.repeat(100)
        const result = Schema.decodeUnknownEither(GoalFormSchema)({
          goalWeight: '150',
          startDate: '',
          targetDate: '',
          notes: longNotes,
        })
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.notes).toBe(longNotes)
        }
      }),
    )
  })
})
