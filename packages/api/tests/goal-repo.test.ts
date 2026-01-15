import { GoalId, Notes, Weight } from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { GoalRepo, GoalRepoLive } from '../src/goals/goal-repo.js'
import { clearTables, makeTestLayer, setupTables } from './helpers/test-db.js'

const TestLayer = makeTestLayer(GoalRepoLive)

describe('GoalRepo', () => {
  describe('create', () => {
    it.effect('creates a goal', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* GoalRepo
        const created = yield* repo.create(
          {
            goalWeight: Weight.make(150),
            startingDate: Option.some(DateTime.unsafeMake('2024-01-01')),
            targetDate: Option.some(DateTime.unsafeMake('2024-06-01')),
            notes: Option.some(Notes.make('Initial goal')),
          },
          180,
          'user-123',
        )

        expect(created.goalWeight).toBe(150)
        expect(created.startingWeight).toBe(180)
        expect(created.isActive).toBe(true)
        expect(created.notes).toBe('Initial goal')
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('update', () => {
    it.effect('updates a goal with apostrophe in notes (SQL injection safe)', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* GoalRepo
        const created = yield* repo.create(
          {
            goalWeight: Weight.make(150),
            startingDate: Option.none(),
            targetDate: Option.none(),
            notes: Option.none(),
          },
          180,
          'user-123',
        )

        // This would have caused SQL injection with the old .unsafe() implementation
        const updated = yield* repo.update(
          {
            id: GoalId.make(created.id),
            notes: "User's notes with 'apostrophes' and \"quotes\"",
          },
          'user-123',
        )

        expect(updated.notes).toBe("User's notes with 'apostrophes' and \"quotes\"")
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('updates goal weight', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* GoalRepo
        const created = yield* repo.create(
          {
            goalWeight: Weight.make(150),
            startingDate: Option.none(),
            targetDate: Option.none(),
            notes: Option.none(),
          },
          180,
          'user-123',
        )

        const updated = yield* repo.update(
          {
            id: GoalId.make(created.id),
            goalWeight: 145,
          },
          'user-123',
        )

        expect(updated.goalWeight).toBe(145)
        expect(updated.startingWeight).toBe(180)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('handles null values correctly', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* GoalRepo
        const created = yield* repo.create(
          {
            goalWeight: Weight.make(150),
            startingDate: Option.none(),
            targetDate: Option.some(DateTime.unsafeMake('2024-06-01')),
            notes: Option.some(Notes.make('Initial notes')),
          },
          180,
          'user-123',
        )

        // Set notes and targetDate to null
        const updated = yield* repo.update(
          {
            id: GoalId.make(created.id),
            notes: null,
            targetDate: null,
          },
          'user-123',
        )

        expect(updated.notes).toBeNull()
        expect(updated.targetDate).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('deactivates other goals when activating', () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* GoalRepo

        // Create first goal (active)
        yield* repo.create(
          {
            goalWeight: Weight.make(150),
            startingDate: Option.none(),
            targetDate: Option.none(),
            notes: Option.none(),
          },
          180,
          'user-123',
        )

        // Create second goal (becomes active, first deactivated)
        const second = yield* repo.create(
          {
            goalWeight: Weight.make(145),
            startingDate: Option.none(),
            targetDate: Option.none(),
            notes: Option.none(),
          },
          175,
          'user-123',
        )

        // Verify second is active
        expect(second.isActive).toBe(true)

        // Deactivate second
        yield* repo.update(
          {
            id: GoalId.make(second.id),
            isActive: false,
          },
          'user-123',
        )

        // Reactivate second
        const reactivated = yield* repo.update(
          {
            id: GoalId.make(second.id),
            isActive: true,
          },
          'user-123',
        )

        expect(reactivated.isActive).toBe(true)

        // First should still be inactive
        const first = yield* repo.list('user-123')
        const firstGoal = first.find((g) => g.id !== second.id)
        expect(firstGoal?.isActive).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
