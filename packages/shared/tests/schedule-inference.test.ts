import { describe, expect, it } from '@effect/vitest'
import {
  Dosage,
  DrugName,
  InjectionLog,
  InjectionLogId,
  type ScheduleInferenceDraft,
  inferScheduleDraftFromInjectionLogs,
} from '../src/index.js'
import { DateTime } from 'effect'

const timestamp = DateTime.makeUnsafe('2024-01-01T00:00:00Z')

const makeInjection = (id: string, datetime: string, dosage: string) =>
  new InjectionLog({
    id: InjectionLogId.make(id),
    datetime: DateTime.makeUnsafe(datetime),
    drug: DrugName.make('Tirzepatide (Zepbound)'),
    source: null,
    dosage: Dosage.make(dosage),
    injectionSite: null,
    notes: null,
    scheduleId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })

const requireDraft = (draft: ScheduleInferenceDraft | null): ScheduleInferenceDraft => {
  if (draft === null) {
    throw new Error('Expected schedule inference draft')
  }
  return draft
}

describe('ScheduleInferenceFromInjectionLogs', () => {
  it('returns no draft when no injection logs are selected', () => {
    expect(inferScheduleDraftFromInjectionLogs([])).toBeNull()
  })

  it('infers draft metadata from the selected injection logs', () => {
    const draft = requireDraft(
      inferScheduleDraftFromInjectionLogs([
        makeInjection('injection-2', '2024-02-01T09:00:00Z', '5mg'),
        makeInjection('injection-1', '2024-01-01T09:00:00Z', '2.5mg'),
      ]),
    )

    expect(draft.name).toBe('Tirzepatide (Zepbound) Schedule')
    expect(draft.drug).toBe('Tirzepatide (Zepbound)')
    expect(DateTime.formatIso(draft.startDate)).toBe('2024-01-01T09:00:00.000Z')
  })

  it('groups dosages by earliest injection date and makes the final phase a maintenance phase', () => {
    const draft = requireDraft(
      inferScheduleDraftFromInjectionLogs([
        makeInjection('injection-3', '2024-02-08T09:00:00Z', '5mg'),
        makeInjection('injection-4', '2024-03-01T09:00:00Z', '7.5mg'),
        makeInjection('injection-2', '2024-01-08T09:00:00Z', '2.5mg'),
        makeInjection('injection-1', '2024-01-01T09:00:00Z', '2.5mg'),
        makeInjection('injection-5', '2024-02-01T09:00:00Z', '5mg'),
      ]),
    )

    expect(draft.phases).toEqual([
      { order: 1, durationDays: 31, dosage: '2.5mg' },
      { order: 2, durationDays: 29, dosage: '5mg' },
      { order: 3, durationDays: null, dosage: '7.5mg' },
    ])
  })
})
