import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { InjectionLog, InjectionLogCreate, InjectionLogId, InjectionLogUpdate } from '@scale/shared'
import { MoreHorizontal } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { ApiClient, createInjectionLogListAtom, ReactivityKeys } from '../../rpc.js'
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
import { InjectionLogForm } from './InjectionLogForm.js'

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))

export function InjectionLogList() {
  const injectionLogAtom = useMemo(() => createInjectionLogListAtom(), [])
  const logsResult = useAtomValue(injectionLogAtom)
  const [showForm, setShowForm] = useState(false)
  const [editingLog, setEditingLog] = useState<InjectionLog | null>(null)

  const createLog = useAtomSet(ApiClient.mutation('InjectionLogCreate'), { mode: 'promise' })
  const updateLog = useAtomSet(ApiClient.mutation('InjectionLogUpdate'), { mode: 'promise' })
  const deleteLog = useAtomSet(ApiClient.mutation('InjectionLogDelete'), { mode: 'promise' })

  const handleCreate = async (data: InjectionLogCreate) => {
    await createLog({
      payload: data,
      reactivityKeys: [ReactivityKeys.injectionLogs, ReactivityKeys.injectionDrugs, ReactivityKeys.injectionSites],
    })
    setShowForm(false)
  }

  const handleUpdate = async (data: InjectionLogUpdate) => {
    await updateLog({
      payload: data,
      reactivityKeys: [ReactivityKeys.injectionLogs, ReactivityKeys.injectionDrugs, ReactivityKeys.injectionSites],
    })
    setEditingLog(null)
  }

  const handleEdit = useCallback((log: InjectionLog) => {
    setEditingLog(log)
    setShowForm(false)
  }, [])

  const handleCancelEdit = () => {
    setEditingLog(null)
  }

  const handleDelete = useCallback(
    async (id: InjectionLogId) => {
      if (confirm('Delete this entry?')) {
        await deleteLog({ payload: { id }, reactivityKeys: [ReactivityKeys.injectionLogs] })
      }
    },
    [deleteLog],
  )

  const columns: ColumnDef<InjectionLog>[] = useMemo(
    () => [
      {
        accessorKey: 'datetime',
        header: 'Date',
        cell: ({ row }) => <span className="font-mono text-sm">{formatDate(row.getValue('datetime'))}</span>,
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'drug',
        header: 'Drug',
        cell: ({ row }) => <span className="font-medium">{row.getValue('drug')}</span>,
      },
      {
        accessorKey: 'dosage',
        header: 'Dosage',
        cell: ({ row }) => <span className="font-mono">{row.getValue('dosage')}</span>,
      },
      {
        accessorKey: 'injectionSite',
        header: 'Site',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{row.getValue('injectionSite') ?? '-'}</span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
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
    [handleDelete, handleEdit],
  )

  if (Result.isWaiting(logsResult)) {
    return <div className="p-6 text-center text-muted-foreground">Loading...</div>
  }

  const logs = Result.getOrElse(logsResult, () => [])

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Injection Log</h2>
        <Button onClick={() => setShowForm(true)}>Add Entry</Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <InjectionLogForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </Card>
      )}

      {editingLog && (
        <Card className="mb-6 p-6">
          <InjectionLogForm
            onSubmit={handleCreate}
            onUpdate={handleUpdate}
            onCancel={handleCancelEdit}
            initialData={{
              id: editingLog.id,
              datetime: editingLog.datetime,
              drug: editingLog.drug,
              source: editingLog.source,
              dosage: editingLog.dosage,
              injectionSite: editingLog.injectionSite,
              notes: editingLog.notes,
            }}
          />
        </Card>
      )}

      {logs.length > 0 ? (
        <DataTable columns={columns} data={[...logs]} />
      ) : (
        <div className="text-center py-12 text-muted-foreground">No entries yet. Add your first injection log.</div>
      )}
    </div>
  )
}
