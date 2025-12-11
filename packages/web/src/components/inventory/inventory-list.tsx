import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import type { Inventory, InventoryCreate, InventoryId, InventoryUpdate } from '@subq/shared'
import { MoreHorizontal } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
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
import { InventoryForm } from './inventory-form.js'

const formatDate = (date: Date | null) => {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(date))
}

const statusColors = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  opened: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  finished: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
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
    for (let i = 0; i < quantity; i++) {
      await createItem({ payload: data, reactivityKeys: [ReactivityKeys.inventory] })
    }
    setShowForm(false)
    setDuplicatingItem(null)
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

  if (Result.isWaiting(inventoryResult)) {
    return <div className="p-6 text-center text-muted-foreground">Loading...</div>
  }

  const items = Result.getOrElse(inventoryResult, () => [])

  // Group by status
  const activeItems = items.filter((i) => i.status !== 'finished')
  const finishedItems = items.filter((i) => i.status === 'finished')

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
              beyondUseDate: editingItem.beyondUseDate,
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
              beyondUseDate: duplicatingItem.beyondUseDate,
            }}
          />
        </Card>
      )}

      {activeItems.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {activeItems.map((item) => (
            <Card key={item.id} className="p-4">
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
                      <DropdownMenuItem onClick={() => handleMarkOpened(item.id)}>Mark Opened</DropdownMenuItem>
                    )}
                    {item.status !== 'finished' && (
                      <DropdownMenuItem onClick={() => handleMarkFinished(item.id)}>Mark Finished</DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleDuplicate(item)}>Duplicate</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleEdit(item)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item.id)}>
                      Delete
                    </DropdownMenuItem>
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
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground mb-8">
          No active inventory. Add your first vial or pen.
        </div>
      )}

      {finishedItems.length > 0 && (
        <>
          <h3 className="text-lg font-medium mb-4 text-muted-foreground">Finished</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 opacity-60">
            {finishedItems.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-medium">{item.drug}</h3>
                    <p className="text-sm text-muted-foreground">{item.source}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(item.id)}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status]}`}>
                    {item.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.totalAmount}</span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
