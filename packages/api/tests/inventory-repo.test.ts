import {
  DrugName,
  DrugSource,
  Inventory,
  type InventoryCreate,
  InventoryId,
  type InventoryListParams,
  InventoryNotFoundError,
  type InventoryUpdate,
  TotalAmount,
} from '@subq/shared'
import { DateTime, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { InventoryRepo } from '../src/inventory/inventory-repo.js'

// ============================================
// Test Layer for InventoryRepo
// ============================================

const InventoryRepoTest = Layer.sync(InventoryRepo, () => {
  const store = new Map<string, Inventory>()
  let counter = 0

  return {
    list: (params: InventoryListParams, _userId: string) =>
      Effect.sync(() => {
        let items = Array.from(store.values())
        if (params.status) {
          items = items.filter((item) => item.status === params.status)
        }
        if (params.drug) {
          items = items.filter((item) => item.drug === params.drug)
        }
        return items.sort(
          (a, b) => DateTime.toEpochMillis(b.createdAt) - DateTime.toEpochMillis(a.createdAt),
        )
      }),

    findById: (id: string) =>
      Effect.sync(() => {
        const item = store.get(id)
        return item ? Option.some(item) : Option.none()
      }),

    create: (data: InventoryCreate, _userId: string) =>
      Effect.sync(() => {
        const id = `inventory-${counter++}`
        const now = DateTime.unsafeNow()
        const item = new Inventory({
          id: InventoryId.make(id),
          drug: data.drug,
          source: data.source,
          form: data.form,
          totalAmount: data.totalAmount,
          status: data.status,
          beyondUseDate: Option.isSome(data.beyondUseDate) ? data.beyondUseDate.value : null,
          createdAt: now,
          updatedAt: now,
        })
        store.set(id, item)
        return item
      }),

    update: (data: InventoryUpdate) =>
      Effect.gen(function* () {
        const current = store.get(data.id)
        if (!current) {
          return yield* InventoryNotFoundError.make({ id: data.id })
        }
        const updated = new Inventory({
          ...current,
          drug: data.drug ?? current.drug,
          source: data.source ?? current.source,
          form: data.form ?? current.form,
          totalAmount: data.totalAmount ?? current.totalAmount,
          status: data.status ?? current.status,
          beyondUseDate:
            data.beyondUseDate && Option.isSome(data.beyondUseDate) ? data.beyondUseDate.value : current.beyondUseDate,
          updatedAt: DateTime.unsafeNow(),
        })
        store.set(data.id, updated)
        return updated
      }),

    delete: (id: string) =>
      Effect.sync(() => {
        const had = store.has(id)
        store.delete(id)
        return had
      }),

    markFinished: (id: string) =>
      Effect.gen(function* () {
        const current = store.get(id)
        if (!current) {
          return yield* InventoryNotFoundError.make({ id })
        }
        const updated = new Inventory({
          ...current,
          status: 'finished',
          updatedAt: DateTime.unsafeNow(),
        })
        store.set(id, updated)
        return updated
      }),

    markOpened: (id: string) =>
      Effect.gen(function* () {
        const current = store.get(id)
        if (!current) {
          return yield* InventoryNotFoundError.make({ id })
        }
        const updated = new Inventory({
          ...current,
          status: 'opened',
          updatedAt: DateTime.unsafeNow(),
        })
        store.set(id, updated)
        return updated
      }),
  }
})

// ============================================
// Tests
// ============================================

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
        expect(DateTime.toEpochMillis(created.beyondUseDate!)).toBe(DateTime.toEpochMillis(beyondUseDate))
      }).pipe(Effect.provide(InventoryRepoTest)),
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
      }).pipe(Effect.provide(InventoryRepoTest)),
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

        const found = yield* repo.findById(created.id)
        expect(Option.isSome(found)).toBe(true)
        if (Option.isSome(found)) {
          expect(found.value.drug).toBe('Test Drug')
        }
      }).pipe(Effect.provide(InventoryRepoTest)),
    )

    it.effect('returns none for non-existent id', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const found = yield* repo.findById('non-existent')
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(InventoryRepoTest)),
    )
  })

  describe('list', () => {
    it.effect('lists all items', () =>
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
      }).pipe(Effect.provide(InventoryRepoTest)),
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
      }).pipe(Effect.provide(InventoryRepoTest)),
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
      }).pipe(Effect.provide(InventoryRepoTest)),
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
        const updated = yield* repo.update({
          id: created.id,
          status: 'opened',
          beyondUseDate: Option.some(newBeyondUseDate),
        })

        expect(updated.status).toBe('opened')
        expect(DateTime.toEpochMillis(updated.beyondUseDate!)).toBe(DateTime.toEpochMillis(newBeyondUseDate))
        expect(updated.drug).toBe('Original') // unchanged
      }).pipe(Effect.provide(InventoryRepoTest)),
    )

    it.effect('fails for non-existent item', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo

        const result = yield* repo
          .update({
            id: InventoryId.make('non-existent'),
            status: 'finished',
            beyondUseDate: Option.none(),
          })
          .pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InventoryNotFoundError')
        }
      }).pipe(Effect.provide(InventoryRepoTest)),
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

        const deleted = yield* repo.delete(created.id)
        expect(deleted).toBe(true)

        const found = yield* repo.findById(created.id)
        expect(Option.isNone(found)).toBe(true)
      }).pipe(Effect.provide(InventoryRepoTest)),
    )

    it.effect('returns false for non-existent item', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo
        const deleted = yield* repo.delete('non-existent')
        expect(deleted).toBe(false)
      }).pipe(Effect.provide(InventoryRepoTest)),
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

        const opened = yield* repo.markOpened(created.id)
        expect(opened.status).toBe('opened')
      }).pipe(Effect.provide(InventoryRepoTest)),
    )

    it.effect('fails for non-existent item', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo

        const result = yield* repo.markOpened('non-existent').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InventoryNotFoundError')
        }
      }).pipe(Effect.provide(InventoryRepoTest)),
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

        const finished = yield* repo.markFinished(created.id)
        expect(finished.status).toBe('finished')
      }).pipe(Effect.provide(InventoryRepoTest)),
    )

    it.effect('fails for non-existent item', () =>
      Effect.gen(function* () {
        const repo = yield* InventoryRepo

        const result = yield* repo.markFinished('non-existent').pipe(Effect.either)

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('InventoryNotFoundError')
        }
      }).pipe(Effect.provide(InventoryRepoTest)),
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
        const opened = yield* repo.markOpened(created.id)
        expect(opened.status).toBe('opened')

        // Finish it
        const finished = yield* repo.markFinished(created.id)
        expect(finished.status).toBe('finished')

        // Verify final state
        const final = yield* repo.findById(created.id)
        expect(Option.isSome(final)).toBe(true)
        if (Option.isSome(final)) {
          expect(final.value.status).toBe('finished')
        }
      }).pipe(Effect.provide(InventoryRepoTest)),
    )
  })
})
