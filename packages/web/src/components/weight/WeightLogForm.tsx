import { useState } from 'react'
import { Option } from 'effect'
import { WeightLogCreate, type WeightUnit } from '@scale/shared'

interface WeightLogFormProps {
  onSubmit: (data: WeightLogCreate) => Promise<void>
  onCancel: () => void
  initialData?: {
    datetime?: Date
    weight?: number
    unit?: WeightUnit
    notes?: string | null
  }
}

export function WeightLogForm({ onSubmit, onCancel, initialData }: WeightLogFormProps) {
  const [datetime, setDatetime] = useState(
    initialData?.datetime?.toISOString().slice(0, 16) ?? new Date().toISOString().slice(0, 16),
  )
  const [weight, setWeight] = useState(initialData?.weight?.toString() ?? '')
  const [unit, setUnit] = useState<WeightUnit>(initialData?.unit ?? 'lbs')
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await onSubmit(
        new WeightLogCreate({
          datetime: new Date(datetime),
          weight: Number.parseFloat(weight),
          unit,
          notes: notes ? Option.some(notes) : Option.none(),
        }),
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: '1rem' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="datetime" style={{ display: 'block', marginBottom: '0.25rem' }}>
          Date & Time
        </label>
        <input
          type="datetime-local"
          id="datetime"
          value={datetime}
          onChange={(e) => setDatetime(e.target.value)}
          required
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="weight" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Weight
          </label>
          <input
            type="number"
            id="weight"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            step="0.1"
            min="0"
            required
            style={{
              padding: '0.5rem',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label htmlFor="unit" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Unit
          </label>
          <select
            id="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as WeightUnit)}
            style={{ padding: '0.5rem' }}
          >
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="notes" style={{ display: 'block', marginBottom: '0.25rem' }}>
          Notes (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <button type="button" onClick={onCancel} style={{ padding: '0.5rem 1rem' }}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  )
}
