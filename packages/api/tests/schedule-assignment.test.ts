import { SqlClient } from 'effect/unstable/sql'
import { InjectionLogId, InjectionScheduleId } from '@subq/shared'
import { Effect, Schema } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { ScheduleAssignment, ScheduleAssignmentLive } from '../src/injection/schedule-assignment.js'
import { insertInjectionLog, insertSchedule, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(ScheduleAssignmentLive)

const AssignmentRow = Schema.Struct({
  id: Schema.String,
  schedule_id: Schema.NullOr(Schema.String),
})
const decodeAssignmentRows = Schema.decodeUnknownEffect(Schema.Array(AssignmentRow))

const listAssignments = (ids: readonly string[]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      SELECT id, schedule_id
      FROM injection_logs
      WHERE id IN ${sql.in(ids)}
      ORDER BY id
    `
    return yield* decodeAssignmentRows(rows)
  })

const scheduleIdFor = (rows: readonly (typeof AssignmentRow.Type)[], id: string) =>
  rows.find((row) => row.id === id)?.schedule_id ?? null

describe('ScheduleAssignment', () => {
  it.layer(TestLayer)((it) => {
    it.effect('assigns an owned injection schedule to owned injection logs', () =>
      Effect.gen(function* () {
        yield* insertSchedule('sched-1', 'TRT', 'Testosterone', 'weekly', new Date('2024-01-01'), 'user-123')
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-123')
        yield* insertInjectionLog('inj-2', new Date('2024-01-22T10:00:00Z'), 'Testosterone', '100mg', 'user-123')

        const assignment = yield* ScheduleAssignment
        const count = yield* assignment.assign(
          {
            ids: [InjectionLogId.make('inj-1'), InjectionLogId.make('inj-2')],
            scheduleId: InjectionScheduleId.make('sched-1'),
          },
          'user-123',
        )

        const rows = yield* listAssignments(['inj-1', 'inj-2'])
        expect(count).toBe(2)
        expect(scheduleIdFor(rows, 'inj-1')).toBe('sched-1')
        expect(scheduleIdFor(rows, 'inj-2')).toBe('sched-1')
      }),
    )
  })

  it.layer(TestLayer)((it) => {
    it.effect('unassigns owned injection logs from an injection schedule', () =>
      Effect.gen(function* () {
        yield* insertSchedule('sched-1', 'TRT', 'Testosterone', 'weekly', new Date('2024-01-01'), 'user-123')
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-123', {
          scheduleId: 'sched-1',
        })

        const assignment = yield* ScheduleAssignment
        const count = yield* assignment.assign(
          {
            ids: [InjectionLogId.make('inj-1')],
            scheduleId: null,
          },
          'user-123',
        )

        const rows = yield* listAssignments(['inj-1'])
        expect(count).toBe(1)
        expect(scheduleIdFor(rows, 'inj-1')).toBeNull()
      }),
    )
  })

  it.layer(TestLayer)((it) => {
    it.effect('ignores injection logs owned by another user', () =>
      Effect.gen(function* () {
        yield* insertSchedule('sched-1', 'TRT', 'Testosterone', 'weekly', new Date('2024-01-01'), 'user-123')
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-123')
        yield* insertInjectionLog('inj-2', new Date('2024-01-22T10:00:00Z'), 'Testosterone', '100mg', 'user-456')

        const assignment = yield* ScheduleAssignment
        const count = yield* assignment.assign(
          {
            ids: [InjectionLogId.make('inj-1'), InjectionLogId.make('inj-2')],
            scheduleId: InjectionScheduleId.make('sched-1'),
          },
          'user-123',
        )

        const rows = yield* listAssignments(['inj-1', 'inj-2'])
        expect(count).toBe(1)
        expect(scheduleIdFor(rows, 'inj-1')).toBe('sched-1')
        expect(scheduleIdFor(rows, 'inj-2')).toBeNull()
      }),
    )
  })

  it.layer(TestLayer)((it) => {
    it.effect('rejects assignment to an injection schedule not owned by the user', () =>
      Effect.gen(function* () {
        yield* insertSchedule('sched-1', 'TRT', 'Testosterone', 'weekly', new Date('2024-01-01'), 'user-456')
        yield* insertInjectionLog('inj-1', new Date('2024-01-15T10:00:00Z'), 'Testosterone', '100mg', 'user-123')

        const assignment = yield* ScheduleAssignment
        const result = yield* assignment
          .assign(
            {
              ids: [InjectionLogId.make('inj-1')],
              scheduleId: InjectionScheduleId.make('sched-1'),
            },
            'user-123',
          )
          .pipe(Effect.result)

        const rows = yield* listAssignments(['inj-1'])
        expect(result._tag).toBe('Failure')
        if (result._tag === 'Failure') {
          expect(result.failure._tag).toBe('ScheduleAssignmentTargetNotFoundError')
        }
        expect(scheduleIdFor(rows, 'inj-1')).toBeNull()
      }),
    )
  })

  it.layer(TestLayer)((it) => {
    it.effect('does nothing when no injection logs are selected', () =>
      Effect.gen(function* () {
        const assignment = yield* ScheduleAssignment
        const count = yield* assignment.assign(
          {
            ids: [],
            scheduleId: InjectionScheduleId.make('missing-schedule'),
          },
          'user-123',
        )

        expect(count).toBe(0)
      }),
    )
  })
})
