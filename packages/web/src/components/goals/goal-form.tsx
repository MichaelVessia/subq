import { Notes, type UserGoal, UserGoalCreate, UserGoalUpdate, Weight } from '@subq/shared'
import { DateTime, Option } from 'effect'
import { useCallback, useState } from 'react'
import { useUserSettings } from '../../hooks/use-user-settings.js'
import { toDateString } from '../../lib/utils.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'
import { Textarea } from '../ui/textarea.js'

function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface GoalFormPropsCreate {
  mode?: 'create'
  onSubmit: (data: UserGoalCreate) => Promise<void>
  onCancel: () => void
  currentWeight?: number | undefined
}

interface GoalFormPropsEdit {
  mode: 'edit'
  existingGoal: UserGoal
  onSubmit: (data: UserGoalUpdate) => Promise<void>
  onCancel: () => void
  currentWeight?: number | undefined
}

type GoalFormProps = GoalFormPropsCreate | GoalFormPropsEdit

interface FormErrors {
  goalWeight?: string | undefined
}

export function GoalForm(props: GoalFormProps) {
  const { onCancel, currentWeight } = props
  const isEditMode = props.mode === 'edit'
  const existingGoal = isEditMode ? props.existingGoal : undefined
  const { displayWeight, toStorageLbs, unitLabel } = useUserSettings()

  // Convert existing goal weight from storage (lbs) to display unit
  const [goalWeight, setGoalWeight] = useState(() =>
    existingGoal ? String(displayWeight(existingGoal.goalWeight).toFixed(1)) : '',
  )
  const [targetDate, setTargetDate] = useState(() =>
    existingGoal?.targetDate ? toDateString(existingGoal.targetDate) : '',
  )
  const [notes, setNotes] = useState(() => existingGoal?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const validateField = useCallback(
    (field: string, value: string): string | undefined => {
      switch (field) {
        case 'goalWeight': {
          if (!value) return 'Goal weight is required'
          const num = Number.parseFloat(value)
          if (Number.isNaN(num)) return 'Must be a number'
          if (num <= 0) return 'Must be greater than 0'
          if (num > 1000) return 'Please enter a realistic weight'
          // Compare in display units - currentWeight is in lbs, convert to display unit
          if (currentWeight && num >= displayWeight(currentWeight)) {
            return 'Goal weight should be less than current weight'
          }
          return undefined
        }
        default:
          return undefined
      }
    },
    [currentWeight, displayWeight],
  )

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {
      goalWeight: validateField('goalWeight', goalWeight),
    }
    setErrors(newErrors)
    return !newErrors.goalWeight
  }, [goalWeight, validateField])

  const handleBlur = (field: string, value: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    setErrors((prev) => ({ ...prev, [field]: validateField(field, value) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ goalWeight: true })

    if (!validateForm()) return

    setLoading(true)
    try {
      // Convert goal weight from display unit to storage (lbs)
      const goalWeightInLbs = toStorageLbs(Number.parseFloat(goalWeight))

      if (isEditMode) {
        await props.onSubmit(
          new UserGoalUpdate({
            id: props.existingGoal.id,
            goalWeight: Weight.make(goalWeightInLbs),
            targetDate: targetDate ? DateTime.unsafeMake(new Date(targetDate)) : null,
            notes: notes ? Notes.make(notes) : null,
          }),
        )
      } else {
        await props.onSubmit(
          new UserGoalCreate({
            goalWeight: Weight.make(goalWeightInLbs),
            targetDate: targetDate ? Option.some(DateTime.unsafeMake(new Date(targetDate))) : Option.none(),
            notes: notes ? Option.some(Notes.make(notes)) : Option.none(),
          }),
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const isValid = !errors.goalWeight && goalWeight !== ''

  // Calculate minimum target date (tomorrow)
  const minDate = new Date()
  minDate.setDate(minDate.getDate() + 1)
  const minDateStr = toLocalDateString(minDate)

  return (
    <form onSubmit={handleSubmit} noValidate>
      {currentWeight && (
        <div className="mb-4 p-3 bg-muted rounded-lg">
          <span className="text-sm text-muted-foreground">Current weight: </span>
          <span className="font-mono font-medium">
            {displayWeight(currentWeight).toFixed(1)} {unitLabel}
          </span>
        </div>
      )}

      <div className="mb-4">
        <Label htmlFor="goalWeight" className="mb-2 block">
          Goal Weight ({unitLabel}) <span className="text-destructive">*</span>
        </Label>
        <Input
          type="number"
          id="goalWeight"
          value={goalWeight}
          onChange={(e) => {
            setGoalWeight(e.target.value)
            if (touched.goalWeight) {
              setErrors((prev) => ({ ...prev, goalWeight: validateField('goalWeight', e.target.value) }))
            }
          }}
          onBlur={(e) => handleBlur('goalWeight', e.target.value)}
          step="0.1"
          min="0"
          max="1000"
          placeholder={unitLabel === 'kg' ? 'e.g., 72' : 'e.g., 160'}
          error={touched.goalWeight && !!errors.goalWeight}
        />
        {touched.goalWeight && errors.goalWeight && (
          <span className="block text-xs text-destructive mt-1">{errors.goalWeight}</span>
        )}
      </div>

      <div className="mb-4">
        <Label htmlFor="targetDate" className="mb-2 block">
          Target Date (optional)
        </Label>
        <Input
          type="date"
          id="targetDate"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          min={minDateStr}
        />
        <span className="block text-xs text-muted-foreground mt-1">
          Leave blank for no deadline - you can always update it later
        </span>
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
          placeholder="e.g., Doctor recommended goal, wedding target, etc."
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading || !isValid}>
          {loading ? (isEditMode ? 'Saving...' : 'Setting Goal...') : isEditMode ? 'Save Changes' : 'Set Goal'}
        </Button>
      </div>
    </form>
  )
}
