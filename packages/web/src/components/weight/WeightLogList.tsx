import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import type { WeightLog, WeightLogCreate, WeightLogId, WeightLogUpdate } from '@scale/shared'
import { useMemo, useState } from 'react'
import { ApiClient, createWeightLogListAtom, ReactivityKeys } from '../../rpc.js'
import { Button } from '../ui/button.js'
import { Card } from '../ui/card.js'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.js'
import { WeightLogForm } from './WeightLogForm.js'

export function WeightLogList() {
  const weightLogAtom = useMemo(() => createWeightLogListAtom(), [])
  const logsResult = useAtomValue(weightLogAtom)
  const [showForm, setShowForm] = useState(false)
  const [editingLog, setEditingLog] = useState<WeightLog | null>(null)

  const createLog = useAtomSet(ApiClient.mutation('WeightLogCreate'), { mode: 'promise' })
  const updateLog = useAtomSet(ApiClient.mutation('WeightLogUpdate'), { mode: 'promise' })
  const deleteLog = useAtomSet(ApiClient.mutation('WeightLogDelete'), { mode: 'promise' })

  const handleCreate = async (data: WeightLogCreate) => {
    await createLog({ payload: data, reactivityKeys: [ReactivityKeys.weightLogs] })
    setShowForm(false)
  }

  const handleUpdate = async (data: WeightLogUpdate) => {
    await updateLog({ payload: data, reactivityKeys: [ReactivityKeys.weightLogs] })
    setEditingLog(null)
  }

  const handleEdit = (log: WeightLog) => {
    setEditingLog(log)
    setShowForm(false)
  }

  const handleCancelEdit = () => {
    setEditingLog(null)
  }

  const handleDelete = async (id: WeightLogId) => {
    if (confirm('Delete this entry?')) {
      await deleteLog({ payload: { id }, reactivityKeys: [ReactivityKeys.weightLogs] })
    }
  }

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(date))

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

      {logs.length > 0 ? (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) =>
                editingLog?.id === log.id ? (
                  <TableRow key={log.id}>
                    <TableCell colSpan={4} className="p-4">
                      <WeightLogForm
                        onSubmit={handleCreate}
                        onUpdate={handleUpdate}
                        onCancel={handleCancelEdit}
                        initialData={{
                          id: log.id,
                          datetime: log.datetime,
                          weight: log.weight,
                          unit: log.unit,
                          notes: log.notes,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">{formatDate(log.datetime)}</TableCell>
                    <TableCell className="font-mono font-medium">
                      {log.weight} {log.unit}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{log.notes ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="mr-2" onClick={() => handleEdit(log)}>
                        Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(log.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="text-center py-12 text-muted-foreground">No entries yet. Add your first weight log.</div>
      )}
    </div>
  )
}
