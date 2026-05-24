import { DateTime } from 'effect'
import type { Inventory } from './domain.js'

export interface InventoryStack {
  readonly key: string
  readonly representative: Inventory
  readonly items: readonly Inventory[]
  readonly count: number
}

export interface InventoryStackGroups {
  readonly active: InventoryStack[]
  readonly finished: InventoryStack[]
}

const beyondUseDateKey = (item: Inventory): string =>
  item.beyondUseDate ? DateTime.formatIso(item.beyondUseDate).slice(0, 10) : 'no-bud'

export const getInventoryStackKey = (item: Inventory): string =>
  `${item.drug}|${item.source}|${item.form}|${item.totalAmount}|${item.status}|${beyondUseDateKey(item)}`

export const groupInventoryIntoStacks = (items: readonly Inventory[]): InventoryStack[] => {
  const stacks = new Map<string, InventoryStack>()

  for (const item of items) {
    const key = getInventoryStackKey(item)
    const existing = stacks.get(key)

    if (existing) {
      stacks.set(key, { ...existing, items: [...existing.items, item], count: existing.count + 1 })
    } else {
      stacks.set(key, { key, representative: item, items: [item], count: 1 })
    }
  }

  return Array.from(stacks.values())
}

export const groupInventoryStacksByStatus = (items: readonly Inventory[]): InventoryStackGroups => ({
  active: groupInventoryIntoStacks(items.filter((item) => item.status !== 'finished')),
  finished: groupInventoryIntoStacks(items.filter((item) => item.status === 'finished')),
})
