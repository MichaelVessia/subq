import { Notes, Weight, WeightLogCreate, WeightLogUpdate, type WeightLogId } from '@subq/shared'
import { Option } from 'effect'
import { useCallback, useState } from 'react'
import { useUserSettings } from '../../hooks/use-user-settings.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'
import { Textarea } from '../ui/textarea.js'

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
  onUpdate?: (data: WeightLogUpdate) => Promise<void>
  onCancel: () => void
  initialData?: {
    id?: WeightLogId
    datetime?: Date
    weight?: number // Weight in lbs (from storage)
    notes?: string | null
  }
}

interface FormErrors {
  datetime?: string | undefined
  weight?: string | undefined
}

export function WeightLogForm({ onSubmit, onUpdate, onCancel, initialData }: WeightLogFormProps) {
  const { weightUnit, displayWeight, toStorageLbs } = useUserSettings()
  const isEditing = !!initialData?.id

  // Convert initial weight from storage (lbs) to display unit for the form
  const initialDisplayWeight = initialData?.weight ? displayWeight(initialData.weight).toString() : ''

  const [datetime, setDatetime] = useState(toLocalDatetimeString(initialData?.datetime ?? new Date()))
  const [weight, setWeight] = useState(initialDisplayWeight)
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
    setTouched({ datetime: true, weight: true })

    if (!validateForm()) return

    setLoading(true)
    try {
      // Convert from user's display unit to storage unit (lbs)
      const weightInLbs = toStorageLbs(Number.parseFloat(weight))

      if (isEditing && onUpdate && initialData?.id) {
        await onUpdate(
          new WeightLogUpdate({
            id: initialData.id,
            datetime: new Date(datetime),
            weight: Weight.make(weightInLbs),
            notes: Option.some(notes ? Notes.make(notes) : null),
          }),
        )
      } else {
        await onSubmit(
          new WeightLogCreate({
            datetime: new Date(datetime),
            weight: Weight.make(weightInLbs),
            notes: notes ? Option.some(Notes.make(notes)) : Option.none(),
          }),
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const isValid = !errors.datetime && !errors.weight && weight !== ''

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <Label htmlFor="datetime" className="mb-2 block">
          Date & Time <span className="text-destructive">*</span>
        </Label>
        <Input
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
          error={touched.datetime && !!errors.datetime}
          max={toLocalDatetimeString(new Date())}
        />
        {touched.datetime && errors.datetime && (
          <span className="block text-xs text-destructive mt-1">{errors.datetime}</span>
        )}
      </div>

      <div className="mb-4">
        <Label htmlFor="weight" className="mb-2 block">
          Weight ({weightUnit}) <span className="text-destructive">*</span>
        </Label>
        <Input
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
          placeholder={weightUnit === 'kg' ? 'e.g., 84.0' : 'e.g., 185.5'}
          error={touched.weight && !!errors.weight}
        />
        {touched.weight && errors.weight && (
          <span className="block text-xs text-destructive mt-1">{errors.weight}</span>
        )}
      </div>

      <div className="mb-5">
        <Label htmlFor="notes" className="mb-2 block">
          Notes
        </Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g., Morning weigh-in, after workout, fasted..."
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading || !isValid}>
          {loading ? 'Saving...' : isEditing ? 'Update' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
