import { useState } from 'react'
import { Result, useAtomValue, useAtomSet } from '@effect-atom/atom-react'
import type { InjectionLogCreate } from '@scale/shared'
import { InjectionLogListAtom, ApiClient, ReactivityKeys } from '../../rpc.js'
import { InjectionLogForm } from './InjectionLogForm.js'

export function InjectionLogList() {
  const logsResult = useAtomValue(InjectionLogListAtom)
  const [showForm, setShowForm] = useState(false)

  // Mutations
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

  // Handle loading state using Result
  if (Result.isWaiting(logsResult)) {
    return <div>Loading...</div>
  }

  const logs = Result.getOrElse(logsResult, () => [])

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Injection Log</h2>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Add Entry
        </button>
      </div>

      {showForm && (
        <div
          style={{
            border: '1px solid #ccc',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <InjectionLogForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc' }}>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Date</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Drug</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Dosage</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Site</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.5rem' }}>{formatDate(log.datetime)}</td>
              <td style={{ padding: '0.5rem' }}>{log.drug}</td>
              <td style={{ padding: '0.5rem' }}>{log.dosage}</td>
              <td style={{ padding: '0.5rem', color: '#666' }}>{log.injectionSite ?? '-'}</td>
              <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => handleDelete(log.id)}
                  style={{
                    color: '#dc2626',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {logs.length === 0 && (
        <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
          No entries yet. Add your first injection log!
        </p>
      )}
    </div>
  )
}
