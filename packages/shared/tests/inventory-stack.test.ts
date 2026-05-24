import { describe, expect, it } from '@effect/vitest'
import { DateTime } from 'effect'
import { DrugName, DrugSource, Inventory, InventoryId, TotalAmount } from '../src/index.js'
import { getInventoryStackKey, groupInventoryIntoStacks, groupInventoryStacksByStatus } from '../src/inventory/index.js'

interface InventoryItemParams {
  readonly id: string
  readonly drug?: string
  readonly source?: string
  readonly form?: 'vial' | 'pen'
  readonly totalAmount?: string
  readonly status?: 'new' | 'opened' | 'finished'
  readonly beyondUseDate?: DateTime.Utc | null
}

const inventoryItem = ({
  id,
  drug = 'Semaglutide (Compounded)',
  source = 'Empower',
  form = 'vial',
  totalAmount = '10mg',
  status = 'new',
  beyondUseDate = null,
}: InventoryItemParams) =>
  new Inventory({
    id: InventoryId.make(id),
    drug: DrugName.make(drug),
    source: DrugSource.make(source),
    form,
    totalAmount: TotalAmount.make(totalAmount),
    status,
    beyondUseDate,
    createdAt: DateTime.makeUnsafe('2024-01-01T00:00:00Z'),
    updatedAt: DateTime.makeUnsafe('2024-01-01T00:00:00Z'),
  })

describe('InventoryStack', () => {
  it('groups identical inventory items into one stack', () => {
    const firstItem = inventoryItem({ id: 'first' })
    const items = [firstItem, inventoryItem({ id: 'second' })]

    const stacks = groupInventoryIntoStacks(items)
    const stack = stacks[0]

    expect(stacks).toHaveLength(1)
    expect(stack?.key).toBe(getInventoryStackKey(firstItem))
    expect(stack?.representative.id).toBe('first')
    expect(stack?.count).toBe(2)
    expect(stack?.items.map((item) => item.id)).toEqual(['first', 'second'])
  })

  it('keeps beyond-use date and status in stack identity', () => {
    const firstDate = DateTime.makeUnsafe('2024-03-01T00:00:00Z')
    const secondDate = DateTime.makeUnsafe('2024-03-02T00:00:00Z')
    const stacks = groupInventoryIntoStacks([
      inventoryItem({ id: 'new-march-1', beyondUseDate: firstDate }),
      inventoryItem({ id: 'opened-march-1', status: 'opened', beyondUseDate: firstDate }),
      inventoryItem({ id: 'new-march-2', beyondUseDate: secondDate }),
    ])

    expect(stacks).toHaveLength(3)
    expect(stacks.map((stack) => stack.representative.id)).toEqual(['new-march-1', 'opened-march-1', 'new-march-2'])
  })

  it('splits active and finished inventory stacks', () => {
    const groups = groupInventoryStacksByStatus([
      inventoryItem({ id: 'active-1' }),
      inventoryItem({ id: 'active-2' }),
      inventoryItem({ id: 'finished-1', status: 'finished' }),
    ])

    expect(groups.active).toHaveLength(1)
    expect(groups.active[0]?.count).toBe(2)
    expect(groups.finished).toHaveLength(1)
    expect(groups.finished[0]?.representative.id).toBe('finished-1')
  })
})
