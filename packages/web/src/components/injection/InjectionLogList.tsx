import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import type { InjectionLogCreate } from '@scale/shared'
import { useState } from 'react'
import { ApiClient, InjectionLogListAtom, ReactivityKeys } from '../../rpc.js'
import { InjectionLogForm } from './InjectionLogForm.js'

export function InjectionLogList() {
  const logsResult = useAtomValue(InjectionLogListAtom)
  const [showForm, setShowForm] = useState(false)

  const createLog = useAtomSet(ApiClient.mutation('InjectionLogCreate'), { mode: 'promise' })
  const deleteLog = useAtomSet(ApiClient.mutation('InjectionLogDelete'), { mode: 'promise' })

  const handleCreate = async (data: InjectionLogCreate) => {
    await createLog({
      payload: data,
      reactivityKeys: [ReactivityKeys.injectionLogs, ReactivityKeys.injectionDrugs, ReactivityKeys.injectionSites],
    })
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
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
    return <div className="loading">Loading...</div>
  }

  const logs = Result.getOrElse(logsResult, () => [])

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-6)',
        }}
      >
        <h2>Injection Log</h2>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
          Add Entry
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <InjectionLogForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {logs.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Drug</th>
                <th>Dosage</th>
                <th>Site</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                    {formatDate(log.datetime)}
                  </td>
                  <td style={{ fontWeight: 500 }}>{log.drug}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{log.dosage}</td>
                  <td className="text-secondary text-sm">{log.injectionSite ?? '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-danger" onClick={() => handleDelete(log.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">No entries yet. Add your first injection log.</div>
      )}
    </div>
  )
}
