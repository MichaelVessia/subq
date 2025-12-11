import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Notes, Weight, WeightLogCreate, WeightLogUpdate, type WeightLogId } from '@subq/shared'
import { DateTime, Option } from 'effect'
import { useForm } from 'react-hook-form'
import { useUserSettings } from '../../hooks/use-user-settings.js'
import { type WeightLogFormInput, weightLogFormStandardSchema } from '../../lib/form-schemas.js'
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

export function WeightLogForm({ onSubmit, onUpdate, onCancel, initialData }: WeightLogFormProps) {
  const { weightUnit, displayWeight, toStorageLbs } = useUserSettings()
  const isEditing = !!initialData?.id

  // Convert initial weight from storage (lbs) to display unit for the form
  const initialDisplayWeight = initialData?.weight ? displayWeight(initialData.weight).toString() : ''

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WeightLogFormInput>({
    resolver: standardSchemaResolver(weightLogFormStandardSchema),
    mode: 'onBlur',
    defaultValues: {
      datetime: toLocalDatetimeString(initialData?.datetime ?? new Date()),
      weight: initialDisplayWeight,
      notes: initialData?.notes ?? '',
    },
  })

  const weight = watch('weight')
  // Simple validity check for button enable state (matches original behavior)
  const hasRequiredFields = weight !== ''

  const onFormSubmit = async (data: WeightLogFormInput) => {
    // Convert from user's display unit to storage unit (lbs)
    const weightInLbs = toStorageLbs(Number.parseFloat(data.weight))

    if (isEditing && onUpdate && initialData?.id) {
      await onUpdate(
        new WeightLogUpdate({
          id: initialData.id,
          datetime: DateTime.unsafeMake(new Date(data.datetime)),
          weight: Weight.make(weightInLbs),
          notes: Option.some(data.notes ? Notes.make(data.notes) : null),
        }),
      )
    } else {
      await onSubmit(
        new WeightLogCreate({
          datetime: DateTime.unsafeMake(new Date(data.datetime)),
          weight: Weight.make(weightInLbs),
          notes: data.notes ? Option.some(Notes.make(data.notes)) : Option.none(),
        }),
      )
    }
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
      <div className="mb-4">
        <Label htmlFor="datetime" className="mb-2 block">
          Date & Time <span className="text-destructive">*</span>
        </Label>
        <Input
          type="datetime-local"
          id="datetime"
          {...register('datetime')}
          error={!!errors.datetime}
          max={toLocalDatetimeString(new Date())}
        />
        {errors.datetime && <span className="block text-xs text-destructive mt-1">{errors.datetime.message}</span>}
      </div>

      <div className="mb-4">
        <Label htmlFor="weight" className="mb-2 block">
          Weight ({weightUnit}) <span className="text-destructive">*</span>
        </Label>
        <Input
          type="number"
          id="weight"
          {...register('weight')}
          step="0.1"
          min="0"
          max="1000"
          placeholder={weightUnit === 'kg' ? 'e.g., 84.0' : 'e.g., 185.5'}
          error={!!errors.weight}
        />
        {errors.weight && <span className="block text-xs text-destructive mt-1">{errors.weight.message}</span>}
      </div>

      <div className="mb-5">
        <Label htmlFor="notes" className="mb-2 block">
          Notes
        </Label>
        <Textarea
          id="notes"
          {...register('notes')}
          rows={2}
          placeholder="e.g., Morning weigh-in, after workout, fasted..."
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !hasRequiredFields}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
