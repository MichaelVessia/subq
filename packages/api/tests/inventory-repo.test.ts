import { DrugName, DrugSource, InventoryId, TotalAmount } from '@subq/shared'
import { DateTime, Effect, Option } from 'effect'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { InventoryRepo, InventoryRepoLive } from '../src/inventory/inventory-repo.js'
import { insertInventory, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(InventoryRepoLive)

describe('InventoryRepo', () => {
  describe('create', () => {
    it.effect('creates inventory item with all fields', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const beyondUseDate = DateTime.unsafeMake('2024-03-01')
        const created = yield* repo.create(
          {
            drug: DrugName.make('Semaglutide'),
            source: DrugSource.make('Empower Pharmacy'),
            form: 'vial',
            totalAmount: TotalAmount.make('10mg'),
            status: 'new',
            beyondUseDate: Option.some(beyondUseDate),
          },
          'user-123',
        )

        expect(created.drug).toBe('Semaglutide')
        expect(created.source).toBe('Empower Pharmacy')
        expect(created.form).toBe('vial')
        expect(created.totalAmount).toBe('10mg')
        expect(created.status).toBe('new')
        expect(created.beyondUseDate).not.toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('creates inventory item without beyondUseDate', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const created = yield* repo.create(
          {
            drug: DrugName.make('Ozempic'),
            source: DrugSource.make('CVS'),
            form: 'pen',
            totalAmount: TotalAmount.make('2mg'),
            status: 'new',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )

        expect(created.drug).toBe('Ozempic')
        expect(created.form).toBe('pen')
        expect(created.beyondUseDate).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('findById', () => {
    it.effect('finds existing item', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const created = yield* repo.create(
          {
            drug: DrugName.make('Test Drug'),
            source: DrugSource.make('Test Source'),
            form: 'vial',
            totalAmount: TotalAmount.make('5mg'),
            status: 'new',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )

        const found = yield* repo.findById(created.id, 'user-123')
        expect(Option.isSome(found)).toBe(true)
        if (Option.isSome(found)) {
          expect(found.value.drug).toBe('Test Drug')
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('returns none for non-existent id', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const found = yield* repo.findById('non-existent', 'user-123')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('does not find item belonging to different user', () =>
      Effect.gen(function* () {
        yield* insertInventory('inv-1', 'Semaglutide', 'Empower', 'vial', '10mg', 'new', 'user-456')

        const repo = yield* InventoryRepo
        const found = yield* repo.findById('inv-1', 'user-123')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('list', () => {
    it.effect('lists all items for user', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        yield* repo.create(
          {
            drug: DrugName.make('Drug A'),
            source: DrugSource.make('Source'),
            form: 'vial',
            totalAmount: TotalAmount.make('10mg'),
            status: 'new',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )
        yield* repo.create(
          {
            drug: DrugName.make('Drug B'),
            source: DrugSource.make('Source'),
            form: 'pen',
            totalAmount: TotalAmount.make('5mg'),
            status: 'opened',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )

        const items = yield* repo.list({}, 'user-123')
        expect(items.length).toBe(2)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('filters by status', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        yield* repo.create(
          {
            drug: DrugName.make('New Drug'),
            source: DrugSource.make('Source'),
            form: 'vial',
            totalAmount: TotalAmount.make('10mg'),
            status: 'new',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )
        yield* repo.create(
          {
            drug: DrugName.make('Opened Drug'),
            source: DrugSource.make('Source'),
            form: 'pen',
            totalAmount: TotalAmount.make('5mg'),
            status: 'opened',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )

        const newItems = yield* repo.list({ status: 'new' }, 'user-123')
        expect(newItems.length).toBe(1)
        expect(newItems[0]!.drug).toBe('New Drug')

        const openedItems = yield* repo.list({ status: 'opened' }, 'user-123')
        expect(openedItems.length).toBe(1)
        expect(openedItems[0]!.drug).toBe('Opened Drug')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('filters by drug', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        yield* repo.create(
          {
            drug: DrugName.make('Semaglutide'),
            source: DrugSource.make('Source'),
            form: 'vial',
            totalAmount: TotalAmount.make('10mg'),
            status: 'new',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )
        yield* repo.create(
          {
            drug: DrugName.make('Tirzepatide'),
            source: DrugSource.make('Source'),
            form: 'pen',
            totalAmount: TotalAmount.make('5mg'),
            status: 'new',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )

        const filtered = yield* repo.list({ drug: DrugName.make('Semaglutide') }, 'user-123')
        expect(filtered.length).toBe(1)
        expect(filtered[0]!.drug).toBe('Semaglutide')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('only returns items for the specified user', () =>
      Effect.gen(function* () {
        yield* insertInventory('inv-1', 'Drug A', 'Source', 'vial', '10mg', 'new', 'user-123')
        yield* insertInventory('inv-2', 'Drug B', 'Source', 'vial', '10mg', 'new', 'user-456')
        yield* insertInventory('inv-3', 'Drug C', 'Source', 'vial', '10mg', 'new', 'user-123')

        const repo = yield* InventoryRepo
        const items = yield* repo.list({}, 'user-123')

        expect(items.length).toBe(2)
        expect(items.every((i) => i.id === 'inv-1' || i.id === 'inv-3')).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('update', () => {
    it.effect('updates inventory fields', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const created = yield* repo.create(
          {
            drug: DrugName.make('Original'),
            source: DrugSource.make('Original Source'),
            form: 'vial',
            totalAmount: TotalAmount.make('10mg'),
            status: 'new',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )

        const newBeyondUseDate = DateTime.unsafeMake('2024-04-01')
        const updated = yield* repo.update(
          {
            id: created.id,
            status: 'opened',
            beyondUseDate: Option.some(newBeyondUseDate),
          },
          'user-123',
        )

        expect(updated.status).toBe('opened')
        expect(updated.beyondUseDate).not.toBeNull()
        expect(updated.drug).toBe('Original') // unchanged
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('fails for non-existent item', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const result = yield* repo
          .update(
            {
              id: InventoryId.make('non-existent'),
              status: 'finished',
              beyondUseDate: Option.none(),
            },
            'user-123',
          )
          .pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InventoryNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('cannot update item belonging to different user', () =>
      Effect.gen(function* () {
        yield* insertInventory('inv-1', 'Drug', 'Source', 'vial', '10mg', 'new', 'user-456')

        const repo = yield* InventoryRepo
        const result = yield* repo
          .update(
            {
              id: InventoryId.make('inv-1'),
              status: 'finished',
              beyondUseDate: Option.none(),
            },
            'user-123',
          )
          .pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InventoryNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('delete', () => {
    it.effect('deletes existing item', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const created = yield* repo.create(
          {
            drug: DrugName.make('To Delete'),
            source: DrugSource.make('Source'),
            form: 'vial',
            totalAmount: TotalAmount.make('10mg'),
            status: 'new',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )

        const deleted = yield* repo.delete(created.id, 'user-123')
        expect(deleted).toBe(true)

        const found = yield* repo.findById(created.id, 'user-123')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('returns false for non-existent item', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const deleted = yield* repo.delete('non-existent', 'user-123')
        expect(deleted).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('cannot delete item belonging to different user', () =>
      Effect.gen(function* () {
        yield* insertInventory('inv-1', 'Drug', 'Source', 'vial', '10mg', 'new', 'user-456')

        const repo = yield* InventoryRepo
        const deleted = yield* repo.delete('inv-1', 'user-123')
        expect(deleted).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('markOpened', () => {
    it.effect('marks item as opened', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const created = yield* repo.create(
          {
            drug: DrugName.make('Test'),
            source: DrugSource.make('Source'),
            form: 'vial',
            totalAmount: TotalAmount.make('10mg'),
            status: 'new',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )

        expect(created.status).toBe('new')

        const opened = yield* repo.markOpened(created.id, 'user-123')
        expect(opened.status).toBe('opened')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('fails for non-existent item', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const result = yield* repo.markOpened('non-existent', 'user-123').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InventoryNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('cannot mark item belonging to different user', () =>
      Effect.gen(function* () {
        yield* insertInventory('inv-1', 'Drug', 'Source', 'vial', '10mg', 'new', 'user-456')

        const repo = yield* InventoryRepo
        const result = yield* repo.markOpened('inv-1', 'user-123').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InventoryNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('markFinished', () => {
    it.effect('marks item as finished', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const created = yield* repo.create(
          {
            drug: DrugName.make('Test'),
            source: DrugSource.make('Source'),
            form: 'vial',
            totalAmount: TotalAmount.make('10mg'),
            status: 'opened',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )

        expect(created.status).toBe('opened')

        const finished = yield* repo.markFinished(created.id, 'user-123')
        expect(finished.status).toBe('finished')
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('fails for non-existent item', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const result = yield* repo.markFinished('non-existent', 'user-123').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InventoryNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect('cannot mark item belonging to different user', () =>
      Effect.gen(function* () {
        yield* insertInventory('inv-1', 'Drug', 'Source', 'vial', '10mg', 'opened', 'user-456')

        const repo = yield* InventoryRepo
        const result = yield* repo.markFinished('inv-1', 'user-123').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InventoryNotFoundError')
        }
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe('inventory lifecycle', () => {
    it.effect('tracks full lifecycle: new -> opened -> finished', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo

        // Create new item
        const created = yield* repo.create(
          {
            drug: DrugName.make('Semaglutide'),
            source: DrugSource.make('Empower'),
            form: 'vial',
            totalAmount: TotalAmount.make('10mg'),
            status: 'new',
            beyondUseDate: Option.none(),
          },
          'user-123',
        )
        expect(created.status).toBe('new')

        // Open it
        const opened = yield* repo.markOpened(created.id, 'user-123')
        expect(opened.status).toBe('opened')

        // Finish it
        const finished = yield* repo.markFinished(created.id, 'user-123')
        expect(finished.status).toBe('finished')

        // Verify final state
        const final = yield* repo.findById(created.id, 'user-123')
        expect(Option.isSome(final)).toBe(true)
        if (Option.isSome(final)) {
          expect(final.value.status).toBe('finished')
        }
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
