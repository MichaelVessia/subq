import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Notes, type UserGoal, UserGoalCreate, UserGoalUpdate, Weight } from '@subq/shared'
import { DateTime, Option } from 'effect'
import { useForm } from 'react-hook-form'
import { useUserSettings } from '../../hooks/use-user-settings.js'
import { type GoalFormInput, goalFormStandardSchema } from '../../lib/form-schemas.js'
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

export function GoalForm(props: GoalFormProps) {
  const { onCancel, currentWeight } = props
  const isEditMode = props.mode === 'edit'
  const existingGoal = isEditMode ? props.existingGoal : undefined
  const { displayWeight, toStorageLbs, unitLabel } = useUserSettings()

  // Convert existing goal weight from storage (lbs) to display unit
  const initialGoalWeight = existingGoal ? String(displayWeight(existingGoal.goalWeight).toFixed(1)) : ''
  const initialStartDate = existingGoal?.startingDate
    ? toDateString(existingGoal.startingDate)
    : toLocalDateString(new Date())
  const initialTargetDate = existingGoal?.targetDate ? toDateString(existingGoal.targetDate) : ''
  const initialNotes = existingGoal?.notes ?? ''

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<GoalFormInput>({
    resolver: standardSchemaResolver(goalFormStandardSchema),
    mode: 'onBlur',
    defaultValues: {
      goalWeight: initialGoalWeight,
      startDate: initialStartDate,
      targetDate: initialTargetDate,
      notes: initialNotes,
    },
  })

  const goalWeight = watch('goalWeight')
  const hasRequiredFields = goalWeight !== ''

  const onFormSubmit = async (data: GoalFormInput) => {
    // Convert goal weight from display unit to storage (lbs)
    const goalWeightInLbs = toStorageLbs(Number.parseFloat(data.goalWeight))

    if (isEditMode) {
      await props.onSubmit(
        new UserGoalUpdate({
          id: props.existingGoal.id,
          goalWeight: Weight.make(goalWeightInLbs),
          startingDate: data.startDate ? DateTime.unsafeMake(new Date(data.startDate)) : undefined,
          targetDate: data.targetDate ? DateTime.unsafeMake(new Date(data.targetDate)) : null,
          notes: data.notes ? Notes.make(data.notes) : null,
        }),
      )
    } else {
      await props.onSubmit(
        new UserGoalCreate({
          goalWeight: Weight.make(goalWeightInLbs),
          startingDate: data.startDate ? Option.some(DateTime.unsafeMake(new Date(data.startDate))) : Option.none(),
          targetDate: data.targetDate ? Option.some(DateTime.unsafeMake(new Date(data.targetDate))) : Option.none(),
          notes: data.notes ? Option.some(Notes.make(data.notes)) : Option.none(),
        }),
      )
    }
  }

  // Cross-field validation: goal weight must be less than current weight
  const validateGoalWeightVsCurrent = (value: string): string | true => {
    if (!currentWeight) return true
    const num = Number.parseFloat(value)
    if (Number.isNaN(num)) return true // Let schema handle this
    const currentWeightDisplay = displayWeight(currentWeight)
    if (num >= currentWeightDisplay) {
      return 'Goal weight should be less than current weight'
    }
    return true
  }

  // Calculate minimum target date (tomorrow)
  const minDate = new Date()
  minDate.setDate(minDate.getDate() + 1)
  const minDateStr = toLocalDateString(minDate)

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
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
          {...register('goalWeight', { validate: validateGoalWeightVsCurrent })}
          step="0.1"
          min="0"
          max="1000"
          placeholder={unitLabel === 'kg' ? 'e.g., 72' : 'e.g., 160'}
          error={!!errors.goalWeight}
        />
        {errors.goalWeight && <span className="block text-xs text-destructive mt-1">{errors.goalWeight.message}</span>}
      </div>

      <div className="mb-4">
        <Label htmlFor="startDate" className="mb-2 block">
          Start Date
        </Label>
        <Input type="date" id="startDate" {...register('startDate')} />
        <span className="block text-xs text-muted-foreground mt-1">
          When you started working toward this goal. Use a past date if you've already been tracking progress.
        </span>
      </div>

      <div className="mb-4">
        <Label htmlFor="targetDate" className="mb-2 block">
          Target Date (optional)
        </Label>
        <Input type="date" id="targetDate" {...register('targetDate')} min={minDateStr} />
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
          {...register('notes')}
          rows={2}
          placeholder="e.g., Doctor recommended goal, wedding target, etc."
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !hasRequiredFields}>
          {isSubmitting ? (isEditMode ? 'Saving...' : 'Setting Goal...') : isEditMode ? 'Save Changes' : 'Set Goal'}
        </Button>
      </div>
    </form>
  )
}
