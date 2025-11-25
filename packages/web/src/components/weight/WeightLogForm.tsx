import { WeightLogCreate, type WeightUnit } from '@scale/shared'
import { Option } from 'effect'
import { useState } from 'react'

function toLocalDatetimeString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

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
  const [datetime, setDatetime] = useState(toLocalDatetimeString(initialData?.datetime ?? new Date()))
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
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label htmlFor="datetime">Date & Time</label>
        <input
          type="datetime-local"
          id="datetime"
          value={datetime}
          onChange={(e) => setDatetime(e.target.value)}
          required
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div>
          <label htmlFor="weight">Weight</label>
          <input
            type="number"
            id="weight"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            step="0.1"
            min="0"
            required
          />
        </div>

        <div>
          <label htmlFor="unit">Unit</label>
          <select id="unit" value={unit} onChange={(e) => setUnit(e.target.value as WeightUnit)}>
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <label htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  )
}
