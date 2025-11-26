import { WeightLogCreate, type WeightUnit } from '@scale/shared'
import { Option } from 'effect'
import { useCallback, useState } from 'react'

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

interface FormErrors {
  datetime?: string | undefined
  weight?: string | undefined
}

export function WeightLogForm({ onSubmit, onCancel, initialData }: WeightLogFormProps) {
  const [datetime, setDatetime] = useState(toLocalDatetimeString(initialData?.datetime ?? new Date()))
  const [weight, setWeight] = useState(initialData?.weight?.toString() ?? '')
  const [unit, setUnit] = useState<WeightUnit>(initialData?.unit ?? 'lbs')
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const validateField = useCallback((field: string, value: string): string | undefined => {
    switch (field) {
      case 'datetime': {
        if (!value) return 'Date & time is required'
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return 'Invalid date'
        if (date > new Date()) return 'Cannot log future weights'
        return undefined
      }
      case 'weight': {
        if (!value) return 'Weight is required'
        const num = Number.parseFloat(value)
        if (Number.isNaN(num)) return 'Must be a number'
        if (num <= 0) return 'Must be greater than 0'
        if (num > 1000) return 'Please enter a realistic weight'
        return undefined
      }
      default:
        return undefined
    }
  }, [])

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {
      datetime: validateField('datetime', datetime),
      weight: validateField('weight', weight),
    }
    setErrors(newErrors)
    return !newErrors.datetime && !newErrors.weight
  }, [datetime, weight, validateField])

  const handleBlur = (field: string, value: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    setErrors((prev) => ({ ...prev, [field]: validateField(field, value) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Mark all fields as touched
    setTouched({ datetime: true, weight: true })

    if (!validateForm()) return

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

  const isValid = !errors.datetime && !errors.weight && weight !== ''

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label htmlFor="datetime">
          Date & Time <span className="required-mark">*</span>
        </label>
        <input
          type="datetime-local"
          id="datetime"
          value={datetime}
          onChange={(e) => {
            setDatetime(e.target.value)
            if (touched.datetime) {
              setErrors((prev) => ({ ...prev, datetime: validateField('datetime', e.target.value) }))
            }
          }}
          onBlur={(e) => handleBlur('datetime', e.target.value)}
          className={touched.datetime && errors.datetime ? 'input-error' : ''}
          max={toLocalDatetimeString(new Date())}
        />
        {touched.datetime && errors.datetime && <span className="field-error">{errors.datetime}</span>}
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
          <label htmlFor="weight">
            Weight <span className="required-mark">*</span>
          </label>
          <input
            type="number"
            id="weight"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value)
              if (touched.weight) {
                setErrors((prev) => ({ ...prev, weight: validateField('weight', e.target.value) }))
              }
            }}
            onBlur={(e) => handleBlur('weight', e.target.value)}
            step="0.1"
            min="0"
            max="1000"
            placeholder="e.g., 185.5"
            className={touched.weight && errors.weight ? 'input-error' : ''}
          />
          {touched.weight && errors.weight && <span className="field-error">{errors.weight}</span>}
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
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g., Morning weigh-in, after workout, fasted..."
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading || !isValid}>
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  )
}
