import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { WeightLog, WeightLogCreate, WeightLogId, WeightLogUpdate } from '@subq/shared'
import { MoreHorizontal } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useUserSettings } from '../../hooks/use-user-settings.js'
import { ApiClient, createWeightLogListAtom, ReactivityKeys } from '../../rpc.js'
import { Button } from '../ui/button.js'
import { Card } from '../ui/card.js'
import { DataTable } from '../ui/data-table.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js'
import { WeightLogForm } from './weight-log-form.js'

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))

export function WeightLogList() {
  const { formatWeight, unitLabel } = useUserSettings()
  const weightLogAtom = useMemo(() => createWeightLogListAtom(), [])
  const logsResult = useAtomValue(weightLogAtom)
  const [showForm, setShowForm] = useState(false)
  const [editingLog, setEditingLog] = useState<WeightLog | null>(null)

  const createLog = useAtomSet(ApiClient.mutation('WeightLogCreate'), { mode: 'promise' })
  const updateLog = useAtomSet(ApiClient.mutation('WeightLogUpdate'), { mode: 'promise' })
  const deleteLog = useAtomSet(ApiClient.mutation('WeightLogDelete'), { mode: 'promise' })

  const handleCreate = async (data: WeightLogCreate) => {
    await createLog({ payload: data, reactivityKeys: [ReactivityKeys.weightLogs, ReactivityKeys.goals] })
    setShowForm(false)
  }

  const handleUpdate = async (data: WeightLogUpdate) => {
    await updateLog({ payload: data, reactivityKeys: [ReactivityKeys.weightLogs] })
    setEditingLog(null)
  }

  const handleEdit = useCallback((log: WeightLog) => {
    setEditingLog(log)
    setShowForm(false)
  }, [])

  const handleCancelEdit = () => {
    setEditingLog(null)
  }

  const handleDelete = useCallback(
    async (id: WeightLogId) => {
      if (confirm('Delete this entry?')) {
        await deleteLog({ payload: { id }, reactivityKeys: [ReactivityKeys.weightLogs] })
      }
    },
    [deleteLog],
  )

  const columns: ColumnDef<WeightLog>[] = useMemo(
    () => [
      {
        accessorKey: 'datetime',
        header: 'Date',
        size: 180,
        cell: ({ row }) => <span className="font-mono text-sm">{formatDate(row.getValue('datetime'))}</span>,
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'weight',
        header: `Weight (${unitLabel})`,
        size: 100,
        cell: ({ row }) => <span className="font-mono font-medium">{formatWeight(row.getValue('weight'))}</span>,
        sortingFn: 'basic',
      },
      {
        accessorKey: 'notes',
        header: 'Notes',
        cell: ({ row }) => {
          const notes = row.getValue('notes') as string | null
          return (
            <span className="text-muted-foreground text-sm block truncate" title={notes ?? undefined}>
              {notes ?? '-'}
            </span>
          )
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        size: 80,
        enableHiding: false,
        cell: ({ row }) => {
          const log = row.original

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleEdit(log)}>Edit</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(log.id)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [handleDelete, handleEdit, formatWeight, unitLabel],
  )

  if (Result.isWaiting(logsResult)) {
    return <div className="p-6 text-center text-muted-foreground">Loading...</div>
  }

  const logs = Result.getOrElse(logsResult, () => [])

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Weight Log</h2>
        <Button onClick={() => setShowForm(true)}>Add Entry</Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <WeightLogForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </Card>
      )}

      {editingLog && (
        <Card className="mb-6 p-6">
          <WeightLogForm
            onSubmit={handleCreate}
            onUpdate={handleUpdate}
            onCancel={handleCancelEdit}
            initialData={{
              id: editingLog.id,
              datetime: editingLog.datetime,
              weight: editingLog.weight,
              notes: editingLog.notes,
            }}
          />
        </Card>
      )}

      {logs.length > 0 ? (
        <DataTable columns={columns} data={[...logs]} />
      ) : (
        <div className="text-center py-12 text-muted-foreground">No entries yet. Add your first weight log.</div>
      )}
    </div>
  )
}
