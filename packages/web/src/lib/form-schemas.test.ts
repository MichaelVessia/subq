/**
 * Unit tests for form schemas.
 * Tests validation logic for form inputs.
 */
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect, Either, Schema } from 'effect'
import { ChangePasswordFormSchema, GoalFormSchema, ScheduleFormSchema, SchedulePhaseSchema } from './form-schemas.js'

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

describe('SchedulePhaseSchema', () => {
  describe('valid inputs', () => {
    it.effect('accepts valid phase with duration', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(SchedulePhaseSchema)({
          order: 1,
          durationDays: '28',
          dosage: '2.5mg',
          isIndefinite: false,
        })
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.order).toBe(1)
          expect(result.right.durationDays).toBe('28')
          expect(result.right.dosage).toBe('2.5mg')
          expect(result.right.isIndefinite).toBe(false)
        }
      }),
    )

    it.effect('accepts indefinite phase with empty duration', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(SchedulePhaseSchema)({
          order: 3,
          durationDays: '',
          dosage: '10mg',
          isIndefinite: true,
        })
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.isIndefinite).toBe(true)
          expect(result.right.durationDays).toBe('')
        }
      }),
    )

    it.effect('accepts various dosage formats', () =>
      Effect.gen(function* () {
        const validDosages = ['2.5mg', '0.5ml', '10 units', '100mcg', '5 IU']
        for (const dosage of validDosages) {
          const result = Schema.decodeUnknownEither(SchedulePhaseSchema)({
            order: 1,
            durationDays: '28',
            dosage,
            isIndefinite: false,
          })
          expect(Either.isRight(result)).toBe(true)
        }
      }),
    )
  })

  describe('invalid inputs', () => {
    it.effect('rejects non-indefinite phase with empty duration', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(SchedulePhaseSchema)({
          order: 1,
          durationDays: '',
          dosage: '2.5mg',
          isIndefinite: false,
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects empty dosage', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(SchedulePhaseSchema)({
          order: 1,
          durationDays: '28',
          dosage: '',
          isIndefinite: false,
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects invalid dosage format', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(SchedulePhaseSchema)({
          order: 1,
          durationDays: '28',
          dosage: 'two point five',
          isIndefinite: false,
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects zero order', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(SchedulePhaseSchema)({
          order: 0,
          durationDays: '28',
          dosage: '2.5mg',
          isIndefinite: false,
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects negative order', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(SchedulePhaseSchema)({
          order: -1,
          durationDays: '28',
          dosage: '2.5mg',
          isIndefinite: false,
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })
})

describe('ScheduleFormSchema', () => {
  const validPhase = {
    order: 1,
    durationDays: '28',
    dosage: '2.5mg',
    isIndefinite: false,
  }

  const validIndefinitePhase = {
    order: 2,
    durationDays: '',
    dosage: '5mg',
    isIndefinite: true,
  }

  describe('valid inputs', () => {
    it.effect('accepts valid schedule with single phase', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'Semaglutide Titration',
          drug: 'Semaglutide (Ozempic)',
          frequency: 'weekly',
          startDate: '2024-01-15',
          notes: '',
          phases: [validPhase],
        })
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.name).toBe('Semaglutide Titration')
          expect(result.right.drug).toBe('Semaglutide (Ozempic)')
          expect(result.right.frequency).toBe('weekly')
          expect(result.right.phases.length).toBe(1)
        }
      }),
    )

    it.effect('accepts valid schedule with multiple phases', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'GLP-1 Titration',
          drug: 'Tirzepatide (Mounjaro)',
          frequency: 'weekly',
          startDate: '2024-06-01',
          notes: 'Standard titration protocol',
          phases: [
            { order: 1, durationDays: '28', dosage: '2.5mg', isIndefinite: false },
            { order: 2, durationDays: '28', dosage: '5mg', isIndefinite: false },
            { order: 3, durationDays: '', dosage: '7.5mg', isIndefinite: true },
          ],
        })
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.phases.length).toBe(3)
          expect(result.right.phases[2]?.isIndefinite).toBe(true)
        }
      }),
    )

    it.effect('accepts all valid frequency values', () =>
      Effect.gen(function* () {
        const frequencies = ['daily', 'every_3_days', 'weekly', 'every_2_weeks', 'monthly'] as const
        for (const frequency of frequencies) {
          const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
            name: 'Test Schedule',
            drug: 'Test Drug',
            frequency,
            startDate: '2024-01-01',
            notes: '',
            phases: [validPhase],
          })
          expect(Either.isRight(result)).toBe(true)
        }
      }),
    )

    it.effect('accepts schedule with indefinite last phase', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'Maintenance Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [validPhase, validIndefinitePhase],
        })
        expect(Either.isRight(result)).toBe(true)
      }),
    )
  })

  describe('required fields', () => {
    it.effect('rejects empty name', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: '',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [validPhase],
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects empty drug', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: '',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [validPhase],
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects empty startDate', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '',
          notes: '',
          phases: [validPhase],
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects empty phases array', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [],
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  describe('invalid inputs', () => {
    it.effect('rejects invalid frequency', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'biweekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [validPhase],
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects invalid date format', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: 'not-a-date',
          notes: '',
          phases: [validPhase],
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects indefinite phase that is not last', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [
            { order: 1, durationDays: '', dosage: '2.5mg', isIndefinite: true },
            { order: 2, durationDays: '28', dosage: '5mg', isIndefinite: false },
          ],
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects phase with invalid dosage', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [{ order: 1, durationDays: '28', dosage: 'invalid', isIndefinite: false }],
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  describe('notes handling', () => {
    it.effect('accepts empty notes', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [validPhase],
        })
        expect(Either.isRight(result)).toBe(true)
      }),
    )

    it.effect('accepts long notes', () =>
      Effect.gen(function* () {
        const longNotes = 'Detailed schedule notes '.repeat(50)
        const result = Schema.decodeUnknownEither(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: longNotes,
          phases: [validPhase],
        })
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.notes).toBe(longNotes)
        }
      }),
    )
  })
})

describe('ChangePasswordFormSchema', () => {
  describe('valid inputs', () => {
    it.effect('accepts valid matching passwords', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: 'newPassword456',
          confirmPassword: 'newPassword456',
        })
        expect(Either.isRight(result)).toBe(true)
        if (Either.isRight(result)) {
          expect(result.right.currentPassword).toBe('oldPassword123')
          expect(result.right.newPassword).toBe('newPassword456')
          expect(result.right.confirmPassword).toBe('newPassword456')
        }
      }),
    )

    it.effect('accepts password at minimum length boundary', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ChangePasswordFormSchema)({
          currentPassword: 'current1',
          newPassword: '12345678', // exactly 8 characters
          confirmPassword: '12345678',
        })
        expect(Either.isRight(result)).toBe(true)
      }),
    )
  })

  describe('password mismatch', () => {
    it.effect('rejects non-matching passwords', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: 'newPassword456',
          confirmPassword: 'differentPassword789',
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects case-sensitive mismatch', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: 'newPassword456',
          confirmPassword: 'NEWPASSWORD456',
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  describe('minimum length validation', () => {
    it.effect('rejects password below minimum length', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: '1234567', // 7 characters, below minimum
          confirmPassword: '1234567',
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })

  describe('required fields', () => {
    it.effect('rejects empty currentPassword', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ChangePasswordFormSchema)({
          currentPassword: '',
          newPassword: 'newPassword456',
          confirmPassword: 'newPassword456',
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects empty newPassword', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: '',
          confirmPassword: '',
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )

    it.effect('rejects empty confirmPassword', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownEither(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: 'newPassword456',
          confirmPassword: '',
        })
        expect(Either.isLeft(result)).toBe(true)
      }),
    )
  })
})
