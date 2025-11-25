import { useState } from 'react'
import { Result, useAtomValue, useAtomSet } from '@effect-atom/atom-react'
import type { WeightLogCreate } from '@scale/shared'
import { WeightLogListAtom, ApiClient, ReactivityKeys } from '../../rpc.js'
import { WeightLogForm } from './WeightLogForm.js'

export function WeightLogList() {
  const logsResult = useAtomValue(WeightLogListAtom)
  const [showForm, setShowForm] = useState(false)

  // Mutations
  const createLog = useAtomSet(ApiClient.mutation('WeightLogCreate'), { mode: 'promise' })
  const deleteLog = useAtomSet(ApiClient.mutation('WeightLogDelete'), { mode: 'promise' })

  const handleCreate = async (data: WeightLogCreate) => {
    await createLog({ payload: data, reactivityKeys: [ReactivityKeys.weightLogs] })
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this entry?')) {
      await deleteLog({ payload: { id }, reactivityKeys: [ReactivityKeys.weightLogs] })
    }
  }

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(date))

  // Handle loading and error states using Result
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
        <h2 style={{ margin: 0 }}>Weight Log</h2>
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
          <WeightLogForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc' }}>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Date</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Weight</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Notes</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.5rem' }}>{formatDate(log.datetime)}</td>
              <td style={{ padding: '0.5rem' }}>
                {log.weight} {log.unit}
              </td>
              <td style={{ padding: '0.5rem', color: '#666' }}>{log.notes ?? '-'}</td>
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
          No entries yet. Add your first weight log!
        </p>
      )}
    </div>
  )
}
