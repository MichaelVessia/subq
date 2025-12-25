import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import type { Inventory, InventoryCreate, InventoryId, InventoryUpdate } from '@subq/shared'
import type { DateTime } from 'effect'
import { MoreHorizontal } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toDate } from '../../lib/utils.js'
import { ApiClient, createInventoryListAtom, ReactivityKeys } from '../../rpc.js'
import { Button } from '../ui/button.js'
import { Card } from '../ui/card.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js'
import { DatabaseError, UnauthorizedRedirect } from '../ui/error-states.js'
import { ListSkeleton } from '../ui/skeleton.js'
import { InventoryForm } from './inventory-form.js'

const formatDate = (dt: DateTime.Utc | null) => {
  if (!dt) return '-'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(toDate(dt))
}

const statusColors = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  opened: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  finished: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}

/** Represents a group of identical inventory items */
interface InventoryStack {
  /** All items in this stack */
  items: Inventory[]
  /** The grouping key */
  key: string
}

/** Create a grouping key for an inventory item */
const getStackKey = (item: Inventory): string => {
  const budKey = item.beyondUseDate ? toDate(item.beyondUseDate).toISOString().split('T')[0] : 'no-bud'
  return `${item.drug}|${item.source}|${item.form}|${item.totalAmount}|${item.status}|${budKey}`
}

/** Group inventory items into stacks */
const groupIntoStacks = (items: Inventory[]): InventoryStack[] => {
  const stackMap = new Map<string, Inventory[]>()

  for (const item of items) {
    const key = getStackKey(item)
    const existing = stackMap.get(key) ?? []
    existing.push(item)
    stackMap.set(key, existing)
  }

  return Array.from(stackMap.entries()).map(([key, items]) => ({ key, items }))
}

export function InventoryList() {
  const inventoryAtom = useMemo(() => createInventoryListAtom(), [])
  const inventoryResult = useAtomValue(inventoryAtom)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<Inventory | null>(null)
  const [duplicatingItem, setDuplicatingItem] = useState<Inventory | null>(null)

  const createItem = useAtomSet(ApiClient.mutation('InventoryCreate'), { mode: 'promise' })
  const updateItem = useAtomSet(ApiClient.mutation('InventoryUpdate'), { mode: 'promise' })
  const deleteItem = useAtomSet(ApiClient.mutation('InventoryDelete'), { mode: 'promise' })
  const markFinished = useAtomSet(ApiClient.mutation('InventoryMarkFinished'), { mode: 'promise' })
  const markOpened = useAtomSet(ApiClient.mutation('InventoryMarkOpened'), { mode: 'promise' })

  const handleCreate = async (data: InventoryCreate, quantity: number) => {
    // Close form immediately to avoid flashing during multiple creates
    setShowForm(false)
    setDuplicatingItem(null)

    // Create all items (only trigger reactivity on last one to avoid multiple re-renders)
    for (let i = 0; i < quantity; i++) {
      const isLast = i === quantity - 1
      await createItem({
        payload: data,
        reactivityKeys: isLast ? [ReactivityKeys.inventory] : [],
      })
    }
  }

  const handleUpdate = async (data: InventoryUpdate) => {
    await updateItem({ payload: data, reactivityKeys: [ReactivityKeys.inventory] })
    setEditingItem(null)
  }

  const handleEdit = useCallback((item: Inventory) => {
    setEditingItem(item)
    setShowForm(false)
    setDuplicatingItem(null)
  }, [])

  const handleDuplicate = useCallback((item: Inventory) => {
    setDuplicatingItem(item)
    setShowForm(false)
    setEditingItem(null)
  }, [])

  const handleCancelEdit = () => {
    setEditingItem(null)
  }

  const handleDelete = useCallback(
    async (id: InventoryId) => {
      if (confirm('Delete this inventory item?')) {
        await deleteItem({ payload: { id }, reactivityKeys: [ReactivityKeys.inventory] })
      }
    },
    [deleteItem],
  )

  const handleMarkFinished = useCallback(
    async (id: InventoryId) => {
      await markFinished({ payload: { id }, reactivityKeys: [ReactivityKeys.inventory] })
    },
    [markFinished],
  )

  const handleMarkOpened = useCallback(
    async (id: InventoryId) => {
      await markOpened({ payload: { id }, reactivityKeys: [ReactivityKeys.inventory] })
    },
    [markOpened],
  )

  const handleMarkAllOpened = useCallback(
    async (items: Inventory[]) => {
      for (const item of items) {
        await markOpened({ payload: { id: item.id }, reactivityKeys: [ReactivityKeys.inventory] })
      }
    },
    [markOpened],
  )

  const handleMarkAllFinished = useCallback(
    async (items: Inventory[]) => {
      for (const item of items) {
        await markFinished({ payload: { id: item.id }, reactivityKeys: [ReactivityKeys.inventory] })
      }
    },
    [markFinished],
  )

  const handleDeleteAll = useCallback(
    async (items: Inventory[]) => {
      if (confirm(`Delete all ${items.length} inventory items?`)) {
        for (const item of items) {
          await deleteItem({ payload: { id: item.id }, reactivityKeys: [ReactivityKeys.inventory] })
        }
      }
    },
    [deleteItem],
  )

  const renderContent = (items: readonly Inventory[]) => {
    // Group by status, then stack duplicates
    const activeItems = items.filter((i) => i.status !== 'finished')
    const finishedItems = items.filter((i) => i.status === 'finished')
    const activeStacks = groupIntoStacks([...activeItems])
    const finishedStacks = groupIntoStacks([...finishedItems])

    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold tracking-tight">GLP-1 Inventory</h2>
          <Button onClick={() => setShowForm(true)}>Add Item</Button>
        </div>

        {showForm && (
          <Card className="mb-6 p-6">
            <InventoryForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
          </Card>
        )}

        {editingItem && (
          <Card className="mb-6 p-6">
            <InventoryForm
              onSubmit={handleCreate}
              onUpdate={handleUpdate}
              onCancel={handleCancelEdit}
              initialData={{
                id: editingItem.id,
                drug: editingItem.drug,
                source: editingItem.source,
                form: editingItem.form,
                totalAmount: editingItem.totalAmount,
                status: editingItem.status,
                beyondUseDate: editingItem.beyondUseDate ? toDate(editingItem.beyondUseDate) : null,
              }}
            />
          </Card>
        )}

        {duplicatingItem && (
          <Card className="mb-6 p-6">
            <InventoryForm
              onSubmit={handleCreate}
              onCancel={() => setDuplicatingItem(null)}
              initialData={{
                drug: duplicatingItem.drug,
                source: duplicatingItem.source,
                form: duplicatingItem.form,
                totalAmount: duplicatingItem.totalAmount,
                status: 'new',
                beyondUseDate: duplicatingItem.beyondUseDate ? toDate(duplicatingItem.beyondUseDate) : null,
              }}
            />
          </Card>
        )}

        {activeStacks.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {activeStacks.map((stack) => {
              const item = stack.items[0]!
              const count = stack.items.length
              const isStacked = count > 1

              return (
                <Card key={stack.key} className="p-4 relative">
                  {isStacked && (
                    <div className="absolute top-2 right-12 bg-primary text-primary-foreground text-xs font-medium px-1.5 py-0.5 rounded">
                      ×{count}
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-medium">{item.drug}</h3>
                      <p className="text-sm text-muted-foreground">{item.source}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {item.status === 'new' && (
                          <DropdownMenuItem onClick={() => handleMarkOpened(item.id)}>
                            Mark Opened{isStacked ? ' (1)' : ''}
                          </DropdownMenuItem>
                        )}
                        {item.status === 'new' && isStacked && (
                          <DropdownMenuItem onClick={() => handleMarkAllOpened(stack.items)}>
                            Mark All Opened ({count})
                          </DropdownMenuItem>
                        )}
                        {item.status !== 'finished' && (
                          <DropdownMenuItem onClick={() => handleMarkFinished(item.id)}>
                            Mark Finished{isStacked ? ' (1)' : ''}
                          </DropdownMenuItem>
                        )}
                        {item.status !== 'finished' && isStacked && (
                          <DropdownMenuItem onClick={() => handleMarkAllFinished(stack.items)}>
                            Mark All Finished ({count})
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleDuplicate(item)}>Duplicate</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(item)}>
                          Edit{isStacked ? ' (1)' : ''}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item.id)}>
                          Delete{isStacked ? ' (1)' : ''}
                        </DropdownMenuItem>
                        {isStacked && (
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteAll(stack.items)}>
                            Delete All ({count})
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status]}`}>
                      {item.status}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">{item.form}</span>
                  </div>

                  <div className="text-sm">
                    <span className="font-mono font-medium">{item.totalAmount}</span>
                    <span className="text-muted-foreground"> total</span>
                  </div>

                  {item.beyondUseDate && (
                    <div className="text-xs text-muted-foreground mt-2">BUD: {formatDate(item.beyondUseDate)}</div>
                  )}
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground mb-8">
            No active inventory. Add your first vial or pen.
          </div>
        )}

        {finishedStacks.length > 0 && (
          <>
            <h3 className="text-lg font-medium mb-4 text-muted-foreground">Finished</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 opacity-60">
              {finishedStacks.map((stack) => {
                const item = stack.items[0]!
                const count = stack.items.length
                const isStacked = count > 1

                return (
                  <Card key={stack.key} className="p-4 relative">
                    {isStacked && (
                      <div className="absolute top-2 right-12 bg-primary text-primary-foreground text-xs font-medium px-1.5 py-0.5 rounded">
                        ×{count}
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-medium">{item.drug}</h3>
                        <p className="text-sm text-muted-foreground">{item.source}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item.id)}>
                            Delete{isStacked ? ' (1)' : ''}
                          </DropdownMenuItem>
                          {isStacked && (
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteAll(stack.items)}>
                              Delete All ({count})
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status]}`}>
                        {item.status}
                      </span>
                      <span className="text-xs text-muted-foreground">{item.totalAmount}</span>
                    </div>
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  return Result.builder(inventoryResult)
    .onInitial(() => <ListSkeleton items={6} />)
    .onSuccess((items) => renderContent(items))
    .onErrorTag('Unauthorized', () => <UnauthorizedRedirect />)
    .onError(() => <DatabaseError />)
    .render()
}
