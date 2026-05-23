/**
 * Unit tests for form schemas.
 * Tests validation logic for form inputs.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect, Exit, Schema } from 'effect'
import { ChangePasswordFormSchema, GoalFormSchema, ScheduleFormSchema, SchedulePhaseSchema } from './form-schemas.js'

describe('GoalFormSchema', () => {
  describe('valid inputs', () => {
    it.effect('accepts valid input with all fields', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(GoalFormSchema)({
          goalWeight: '150.5',
          startDate: '2024-01-01',
          targetDate: '2024-06-01',
          notes: 'My weight loss goal',
        })
        expect(Exit.isSuccess(result)).toBe(true)
        if (Exit.isSuccess(result)) {
          expect(result.value.goalWeight).toBe('150.5')
          expect(result.value.startDate).toBe('2024-01-01')
          expect(result.value.targetDate).toBe('2024-06-01')
          expect(result.value.notes).toBe('My weight loss goal')
        }
      }),
    )

    it.effect('accepts valid input with only required goalWeight', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(GoalFormSchema)({
          goalWeight: '180',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Exit.isSuccess(result)).toBe(true)
        if (Exit.isSuccess(result)) {
          expect(result.value.goalWeight).toBe('180')
          expect(result.value.startDate).toBe('')
          expect(result.value.targetDate).toBe('')
          expect(result.value.notes).toBe('')
        }
      }),
    )

    it.effect('accepts boundary weight values', () =>
      Effect.gen(function* () {
        // Just above 0
        const minResult = Schema.decodeUnknownExit(GoalFormSchema)({
          goalWeight: '0.1',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Exit.isSuccess(minResult)).toBe(true)

        // At max boundary
        const maxResult = Schema.decodeUnknownExit(GoalFormSchema)({
          goalWeight: '1000',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Exit.isSuccess(maxResult)).toBe(true)
      }),
    )
  })

  describe('missing weight', () => {
    it.effect('rejects empty goalWeight', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(GoalFormSchema)({
          goalWeight: '',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  describe('invalid weight values', () => {
    it.effect('rejects zero weight', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(GoalFormSchema)({
          goalWeight: '0',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects negative weight', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(GoalFormSchema)({
          goalWeight: '-50',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects weight over 1000', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(GoalFormSchema)({
          goalWeight: '1001',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects non-numeric weight', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(GoalFormSchema)({
          goalWeight: 'abc',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  describe('notes handling', () => {
    it.effect('accepts empty notes', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(GoalFormSchema)({
          goalWeight: '150',
          startDate: '',
          targetDate: '',
          notes: '',
        })
        expect(Exit.isSuccess(result)).toBe(true)
        if (Exit.isSuccess(result)) {
          expect(result.value.notes).toBe('')
        }
      }),
    )

    it.effect('accepts long notes', () =>
      Effect.gen(function* () {
        const longNotes = 'This is a very long note '.repeat(100)
        const result = Schema.decodeUnknownExit(GoalFormSchema)({
          goalWeight: '150',
          startDate: '',
          targetDate: '',
          notes: longNotes,
        })
        expect(Exit.isSuccess(result)).toBe(true)
        if (Exit.isSuccess(result)) {
          expect(result.value.notes).toBe(longNotes)
        }
      }),
    )
  })
})

describe('SchedulePhaseSchema', () => {
  describe('valid inputs', () => {
    it.effect('accepts valid phase with duration', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(SchedulePhaseSchema)({
          order: 1,
          durationDays: '28',
          dosage: '2.5mg',
          isIndefinite: false,
        })
        expect(Exit.isSuccess(result)).toBe(true)
        if (Exit.isSuccess(result)) {
          expect(result.value.order).toBe(1)
          expect(result.value.durationDays).toBe('28')
          expect(result.value.dosage).toBe('2.5mg')
          expect(result.value.isIndefinite).toBe(false)
        }
      }),
    )

    it.effect('accepts indefinite phase with empty duration', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(SchedulePhaseSchema)({
          order: 3,
          durationDays: '',
          dosage: '10mg',
          isIndefinite: true,
        })
        expect(Exit.isSuccess(result)).toBe(true)
        if (Exit.isSuccess(result)) {
          expect(result.value.isIndefinite).toBe(true)
          expect(result.value.durationDays).toBe('')
        }
      }),
    )

    it.effect('accepts various dosage formats', () =>
      Effect.gen(function* () {
        const validDosages = ['2.5mg', '0.5ml', '10 units', '100mcg', '5 IU']
        for (const dosage of validDosages) {
          const result = Schema.decodeUnknownExit(SchedulePhaseSchema)({
            order: 1,
            durationDays: '28',
            dosage,
            isIndefinite: false,
          })
          expect(Exit.isSuccess(result)).toBe(true)
        }
      }),
    )
  })

  describe('invalid inputs', () => {
    it.effect('rejects non-indefinite phase with empty duration', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(SchedulePhaseSchema)({
          order: 1,
          durationDays: '',
          dosage: '2.5mg',
          isIndefinite: false,
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects empty dosage', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(SchedulePhaseSchema)({
          order: 1,
          durationDays: '28',
          dosage: '',
          isIndefinite: false,
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects invalid dosage format', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(SchedulePhaseSchema)({
          order: 1,
          durationDays: '28',
          dosage: 'two point five',
          isIndefinite: false,
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects zero order', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(SchedulePhaseSchema)({
          order: 0,
          durationDays: '28',
          dosage: '2.5mg',
          isIndefinite: false,
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects negative order', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(SchedulePhaseSchema)({
          order: -1,
          durationDays: '28',
          dosage: '2.5mg',
          isIndefinite: false,
        })
        expect(Exit.isFailure(result)).toBe(true)
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
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
          name: 'Semaglutide Titration',
          drug: 'Semaglutide (Ozempic)',
          frequency: 'weekly',
          startDate: '2024-01-15',
          notes: '',
          phases: [validPhase],
        })
        expect(Exit.isSuccess(result)).toBe(true)
        if (Exit.isSuccess(result)) {
          expect(result.value.name).toBe('Semaglutide Titration')
          expect(result.value.drug).toBe('Semaglutide (Ozempic)')
          expect(result.value.frequency).toBe('weekly')
          expect(result.value.phases.length).toBe(1)
        }
      }),
    )

    it.effect('accepts valid schedule with multiple phases', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
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
        expect(Exit.isSuccess(result)).toBe(true)
        if (Exit.isSuccess(result)) {
          expect(result.value.phases.length).toBe(3)
          expect(result.value.phases[2]?.isIndefinite).toBe(true)
        }
      }),
    )

    it.effect('accepts all valid frequency values', () =>
      Effect.gen(function* () {
        const frequencies = ['daily', 'every_3_days', 'weekly', 'every_2_weeks', 'monthly'] as const
        for (const frequency of frequencies) {
          const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
            name: 'Test Schedule',
            drug: 'Test Drug',
            frequency,
            startDate: '2024-01-01',
            notes: '',
            phases: [validPhase],
          })
          expect(Exit.isSuccess(result)).toBe(true)
        }
      }),
    )

    it.effect('accepts schedule with indefinite last phase', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
          name: 'Maintenance Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [validPhase, validIndefinitePhase],
        })
        expect(Exit.isSuccess(result)).toBe(true)
      }),
    )
  })

  describe('required fields', () => {
    it.effect('rejects empty name', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
          name: '',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [validPhase],
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects empty drug', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: '',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [validPhase],
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects empty startDate', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '',
          notes: '',
          phases: [validPhase],
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects empty phases array', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [],
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  describe('invalid inputs', () => {
    it.effect('rejects invalid frequency', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'biweekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [validPhase],
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects invalid date format', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: 'not-a-date',
          notes: '',
          phases: [validPhase],
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects indefinite phase that is not last', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
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
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects phase with invalid dosage', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [{ order: 1, durationDays: '28', dosage: 'invalid', isIndefinite: false }],
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  describe('notes handling', () => {
    it.effect('accepts empty notes', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: '',
          phases: [validPhase],
        })
        expect(Exit.isSuccess(result)).toBe(true)
      }),
    )

    it.effect('accepts long notes', () =>
      Effect.gen(function* () {
        const longNotes = 'Detailed schedule notes '.repeat(50)
        const result = Schema.decodeUnknownExit(ScheduleFormSchema)({
          name: 'Test Schedule',
          drug: 'Semaglutide',
          frequency: 'weekly',
          startDate: '2024-01-01',
          notes: longNotes,
          phases: [validPhase],
        })
        expect(Exit.isSuccess(result)).toBe(true)
        if (Exit.isSuccess(result)) {
          expect(result.value.notes).toBe(longNotes)
        }
      }),
    )
  })
})

describe('ChangePasswordFormSchema', () => {
  describe('valid inputs', () => {
    it.effect('accepts valid matching passwords', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: 'newPassword456',
          confirmPassword: 'newPassword456',
        })
        expect(Exit.isSuccess(result)).toBe(true)
        if (Exit.isSuccess(result)) {
          expect(result.value.currentPassword).toBe('oldPassword123')
          expect(result.value.newPassword).toBe('newPassword456')
          expect(result.value.confirmPassword).toBe('newPassword456')
        }
      }),
    )

    it.effect('accepts password at minimum length boundary', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ChangePasswordFormSchema)({
          currentPassword: 'current1',
          newPassword: '12345678', // exactly 8 characters
          confirmPassword: '12345678',
        })
        expect(Exit.isSuccess(result)).toBe(true)
      }),
    )
  })

  describe('password mismatch', () => {
    it.effect('rejects non-matching passwords', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: 'newPassword456',
          confirmPassword: 'differentPassword789',
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects case-sensitive mismatch', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: 'newPassword456',
          confirmPassword: 'NEWPASSWORD456',
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  describe('minimum length validation', () => {
    it.effect('rejects password below minimum length', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: '1234567', // 7 characters, below minimum
          confirmPassword: '1234567',
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })

  describe('required fields', () => {
    it.effect('rejects empty currentPassword', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ChangePasswordFormSchema)({
          currentPassword: '',
          newPassword: 'newPassword456',
          confirmPassword: 'newPassword456',
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects empty newPassword', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: '',
          confirmPassword: '',
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )

    it.effect('rejects empty confirmPassword', () =>
      Effect.gen(function* () {
        const result = Schema.decodeUnknownExit(ChangePasswordFormSchema)({
          currentPassword: 'oldPassword123',
          newPassword: 'newPassword456',
          confirmPassword: '',
        })
        expect(Exit.isFailure(result)).toBe(true)
      }),
    )
  })
})
