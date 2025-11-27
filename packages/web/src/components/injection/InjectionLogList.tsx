import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import type { ColumnDef } from '@tanstack/react-table'
import type {
  InjectionLog,
  InjectionLogCreate,
  InjectionLogId,
  InjectionLogUpdate,
  InjectionSchedule,
  InjectionScheduleId,
  InventoryId,
  NextScheduledDose,
} from '@scale/shared'
import { InjectionLogBulkAssignSchedule } from '@scale/shared'
import { Calendar, ChevronDown, MoreHorizontal, Plus, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { ApiClient, createInjectionLogListAtom, ReactivityKeys, ScheduleListAtom } from '../../rpc.js'
import { NextDoseBanner } from '../schedule/NextDoseBanner.js'
import { ScheduleForm } from '../schedule/ScheduleForm.js'
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
  const schedulesResult = useAtomValue(ScheduleListAtom)
  const [showForm, setShowForm] = useState(false)
  const [editingLog, setEditingLog] = useState<InjectionLog | null>(null)
  const [prefillData, setPrefillData] = useState<{ drug: string; dosage: string; scheduleId?: string } | null>(null)
  const [selectedLogs, setSelectedLogs] = useState<InjectionLog[]>([])
  const [showNewScheduleForm, setShowNewScheduleForm] = useState(false)

  const createLog = useAtomSet(ApiClient.mutation('InjectionLogCreate'), { mode: 'promise' })
  const updateLog = useAtomSet(ApiClient.mutation('InjectionLogUpdate'), { mode: 'promise' })
  const deleteLog = useAtomSet(ApiClient.mutation('InjectionLogDelete'), { mode: 'promise' })
  const markFinished = useAtomSet(ApiClient.mutation('InventoryMarkFinished'), { mode: 'promise' })
  const bulkAssign = useAtomSet(ApiClient.mutation('InjectionLogBulkAssignSchedule'), { mode: 'promise' })
  const createSchedule = useAtomSet(ApiClient.mutation('ScheduleCreate'), { mode: 'promise' })

  const handleCreate = async (data: InjectionLogCreate) => {
    await createLog({
      payload: data,
      reactivityKeys: [ReactivityKeys.injectionLogs, ReactivityKeys.injectionDrugs, ReactivityKeys.injectionSites],
    })
    setShowForm(false)
  }

  const handleMarkFinished = async (inventoryId: InventoryId) => {
    await markFinished({ payload: { id: inventoryId }, reactivityKeys: [ReactivityKeys.inventory] })
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

  const handleLogScheduledDose = useCallback((nextDose: NextScheduledDose) => {
    setPrefillData({ drug: nextDose.drug, dosage: nextDose.dosage, scheduleId: nextDose.scheduleId })
    setShowForm(true)
    setEditingLog(null)
  }, [])

  const handleBulkAssignSchedule = useCallback(
    async (scheduleId: InjectionScheduleId | null) => {
      if (selectedLogs.length === 0) return
      await bulkAssign({
        payload: new InjectionLogBulkAssignSchedule({
          ids: selectedLogs.map((log) => log.id),
          scheduleId,
        }),
        reactivityKeys: [ReactivityKeys.injectionLogs],
      })
      setSelectedLogs([])
    },
    [selectedLogs, bulkAssign],
  )

  const handleSelectionChange = useCallback((rows: InjectionLog[]) => {
    setSelectedLogs(rows)
  }, [])

  const handleDelete = useCallback(
    async (id: InjectionLogId) => {
      if (confirm('Delete this entry?')) {
        await deleteLog({ payload: { id }, reactivityKeys: [ReactivityKeys.injectionLogs] })
      }
    },
    [deleteLog],
  )

  const schedules = Result.getOrElse(schedulesResult, () => [] as InjectionSchedule[])

  const columns: ColumnDef<InjectionLog>[] = useMemo(
    () => [
      {
        id: 'select',
        size: 40,
        header: ({ table }) => (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(e.target.checked)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'datetime',
        header: 'Date',
        size: 180,
        cell: ({ row }) => <span className="font-mono text-sm">{formatDate(row.getValue('datetime'))}</span>,
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'drug',
        header: 'Drug',
        size: 120,
        cell: ({ row }) => <span className="font-medium">{row.getValue('drug')}</span>,
      },
      {
        accessorKey: 'dosage',
        header: 'Dosage',
        size: 100,
        cell: ({ row }) => <span className="font-mono">{row.getValue('dosage')}</span>,
      },
      {
        accessorKey: 'injectionSite',
        header: 'Site',
        size: 120,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{row.getValue('injectionSite') ?? '-'}</span>
        ),
      },
      {
        id: 'schedule',
        header: 'Schedule',
        size: 140,
        enableSorting: false,
        cell: ({ row }) => {
          const log = row.original
          const schedule = schedules.find((s) => s.id === log.scheduleId)
          return schedule ? (
            <span className="text-sm flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {schedule.name}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
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
    [handleDelete, handleEdit, schedules],
  )

  if (Result.isWaiting(logsResult) || Result.isWaiting(schedulesResult)) {
    return <div className="p-6 text-center text-muted-foreground">Loading...</div>
  }

  const logs = Result.getOrElse(logsResult, () => [] as InjectionLog[])

  return (
    <div>
      <NextDoseBanner onLogDose={handleLogScheduledDose} onQuickLogSuccess={() => setShowForm(false)} />

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Injection Log</h2>
        <Button
          onClick={() => {
            setPrefillData(null)
            setShowForm(true)
          }}
        >
          Add Entry
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <InjectionLogForm
            onSubmit={handleCreate}
            onCancel={() => {
              setShowForm(false)
              setPrefillData(null)
            }}
            onMarkFinished={handleMarkFinished}
            {...(prefillData
              ? {
                  initialData: {
                    drug: prefillData.drug,
                    dosage: prefillData.dosage,
                    ...(prefillData.scheduleId ? { scheduleId: prefillData.scheduleId } : {}),
                  },
                }
              : {})}
          />
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

      {/* Bulk action bar */}
      {selectedLogs.length > 0 && (
        <Card className="mb-4 p-3 bg-muted/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{selectedLogs.length} selected</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedLogs([])}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Calendar className="h-4 w-4 mr-2" />
                    Assign to Schedule
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Existing Schedules</DropdownMenuLabel>
                  {schedules.length > 0 ? (
                    schedules.map((schedule) => (
                      <DropdownMenuItem key={schedule.id} onClick={() => handleBulkAssignSchedule(schedule.id)}>
                        {schedule.name}
                        <span className="ml-auto text-xs text-muted-foreground">{schedule.drug}</span>
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>No schedules available</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowNewScheduleForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Schedule
                  </DropdownMenuItem>
                  {selectedLogs.some((log) => log.scheduleId) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleBulkAssignSchedule(null)}>
                        <X className="h-4 w-4 mr-2" />
                        Unassign from Schedule
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </Card>
      )}

      {/* New schedule form (pre-filled from selected injections) */}
      {showNewScheduleForm && selectedLogs.length > 0 && (
        <Card className="mb-6 p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Create Schedule from Selected Injections</h3>
            <p className="text-sm text-muted-foreground">
              Will link {selectedLogs.length} injection{selectedLogs.length > 1 ? 's' : ''} to this schedule after
              creation.
            </p>
          </div>
          <ScheduleForm
            onSubmit={async (data) => {
              const schedule = await createSchedule({
                payload: data,
                reactivityKeys: [ReactivityKeys.schedule],
              })
              // Bulk assign the selected logs to the new schedule
              await bulkAssign({
                payload: new InjectionLogBulkAssignSchedule({
                  ids: selectedLogs.map((log) => log.id),
                  scheduleId: schedule.id,
                }),
                reactivityKeys: [ReactivityKeys.injectionLogs],
              })
              setShowNewScheduleForm(false)
              setSelectedLogs([])
            }}
            onCancel={() => setShowNewScheduleForm(false)}
            preselectedInjections={selectedLogs}
          />
        </Card>
      )}

      {logs.length > 0 ? (
        <DataTable
          columns={columns}
          data={[...logs]}
          enableRowSelection
          onSelectionChange={handleSelectionChange}
          getRowId={(row) => row.id}
        />
      ) : (
        <div className="text-center py-12 text-muted-foreground">No entries yet. Add your first injection log.</div>
      )}
    </div>
  )
}
