import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import type { InjectionLog, InjectionLogCreate, InjectionLogId, InjectionLogUpdate } from '@scale/shared'
import { useMemo, useState } from 'react'
import { ApiClient, createInjectionLogListAtom, ReactivityKeys } from '../../rpc.js'
import { Button } from '../ui/button.js'
import { Card } from '../ui/card.js'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.js'
import { InjectionLogForm } from './InjectionLogForm.js'

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

  const handleEdit = (log: InjectionLog) => {
    setEditingLog(log)
    setShowForm(false)
  }

  const handleCancelEdit = () => {
    setEditingLog(null)
  }

  const handleDelete = async (id: InjectionLogId) => {
    if (confirm('Delete this entry?')) {
      await deleteLog({ payload: { id }, reactivityKeys: [ReactivityKeys.injectionLogs] })
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
        <h2 className="text-xl font-semibold tracking-tight">Injection Log</h2>
        <Button onClick={() => setShowForm(true)}>Add Entry</Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <InjectionLogForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </Card>
      )}

      {logs.length > 0 ? (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Drug</TableHead>
                <TableHead>Dosage</TableHead>
                <TableHead>Site</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) =>
                editingLog?.id === log.id ? (
                  <TableRow key={log.id}>
                    <TableCell colSpan={5} className="p-4">
                      <InjectionLogForm
                        onSubmit={handleCreate}
                        onUpdate={handleUpdate}
                        onCancel={handleCancelEdit}
                        initialData={{
                          id: log.id,
                          datetime: log.datetime,
                          drug: log.drug,
                          source: log.source,
                          dosage: log.dosage,
                          injectionSite: log.injectionSite,
                          notes: log.notes,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">{formatDate(log.datetime)}</TableCell>
                    <TableCell className="font-medium">{log.drug}</TableCell>
                    <TableCell className="font-mono">{log.dosage}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{log.injectionSite ?? '-'}</TableCell>
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
        <div className="text-center py-12 text-muted-foreground">No entries yet. Add your first injection log.</div>
      )}
    </div>
  )
}
