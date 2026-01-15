import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Result, useAtomValue } from '@effect-atom/atom-react'
import {
  Dosage,
  DrugName,
  type Frequency,
  type InjectionLog,
  type InjectionSchedule,
  InjectionScheduleCreate,
  type InjectionScheduleId,
  InjectionScheduleUpdate,
  Notes,
  type PhaseDurationDays,
  type PhaseOrder,
  ScheduleName,
  SchedulePhaseCreate,
} from '@subq/shared'
import { DateTime, Option } from 'effect'
import { Plus, Trash2 } from 'lucide-react'
import { useFieldArray, useForm } from 'react-hook-form'
import { type ScheduleFormInput, scheduleFormStandardSchema } from '../../lib/form-schemas.js'
import { toDate, toDateString } from '../../lib/utils.js'
import { InjectionDrugsAtom } from '../../rpc.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'
import { Select } from '../ui/select.js'
import { Textarea } from '../ui/textarea.js'

function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const GLP1_DRUGS = [
  'Semaglutide (Ozempic)',
  'Semaglutide (Wegovy)',
  'Semaglutide (Compounded)',
  'Tirzepatide (Mounjaro)',
  'Tirzepatide (Zepbound)',
  'Tirzepatide (Compounded)',
  'Retatrutide (Compounded)',
  'Liraglutide (Saxenda)',
  'Dulaglutide (Trulicity)',
]

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'every_3_days', label: 'Every 3 days' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'every_2_weeks', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
]

interface PhaseInput {
  order: number
  durationDays: string // empty string = indefinite
  dosage: string
  isIndefinite: boolean
}

interface ScheduleFormProps {
  onSubmit: (data: InjectionScheduleCreate) => Promise<void>
  onUpdate?: (data: InjectionScheduleUpdate) => Promise<void>
  onCancel: () => void
  initialData?: InjectionSchedule
  preselectedInjections?: InjectionLog[]
}

/**
 * Infer phases from a list of injections.
 * Groups by dosage, sorts by earliest injection date per dosage,
 * and calculates duration as days between first injection of phase N and phase N+1.
 */
function inferPhasesFromInjections(injections: InjectionLog[]): PhaseInput[] {
  if (injections.length === 0) return [{ order: 1, durationDays: '28', dosage: '', isIndefinite: false }]

  // Group injections by dosage
  const byDosage = new Map<string, Date[]>()
  for (const inj of injections) {
    const dates = byDosage.get(inj.dosage) ?? []
    dates.push(toDate(inj.datetime))
    byDosage.set(inj.dosage, dates)
  }

  // Get earliest date per dosage and sort phases by that date
  const phases: { dosage: string; earliestDate: Date }[] = []
  for (const [dosage, dates] of byDosage) {
    const firstDate = dates[0]
    if (!firstDate) continue
    const earliestDate = dates.reduce((min, d) => (d < min ? d : min), firstDate)
    phases.push({ dosage, earliestDate })
  }
  phases.sort((a, b) => a.earliestDate.getTime() - b.earliestDate.getTime())

  // Calculate duration as days between phase starts
  const result: PhaseInput[] = []
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    if (!phase) continue
    const isLastPhase = i === phases.length - 1
    let durationDays = 28 // default for last phase
    if (!isLastPhase) {
      const nextPhase = phases[i + 1]
      if (nextPhase) {
        const diffMs = nextPhase.earliestDate.getTime() - phase.earliestDate.getTime()
        durationDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)))
      }
    }
    result.push({
      order: i + 1,
      durationDays: isLastPhase ? '' : String(durationDays),
      dosage: phase.dosage,
      isIndefinite: isLastPhase, // Last phase defaults to indefinite
    })
  }

  return result.length > 0 ? result : [{ order: 1, durationDays: '28', dosage: '', isIndefinite: false }]
}

export function ScheduleForm({ onSubmit, onUpdate, onCancel, initialData, preselectedInjections }: ScheduleFormProps) {
  const isEditing = !!initialData

  // Infer initial values from preselected injections
  const inferredFromInjections = preselectedInjections && preselectedInjections.length > 0
  const firstInjection = preselectedInjections?.[0]
  const inferredDrug = firstInjection?.drug ?? ''
  const inferredStartDate =
    inferredFromInjections && firstInjection
      ? toLocalDateString(
          preselectedInjections.reduce(
            (min, inj) => (toDate(inj.datetime) < min ? toDate(inj.datetime) : min),
            toDate(firstInjection.datetime),
          ),
        )
      : toLocalDateString(new Date())
  const inferredPhases = inferredFromInjections
    ? inferPhasesFromInjections(preselectedInjections)
    : [{ order: 1, durationDays: '28', dosage: '', isIndefinite: false }]

  const initialPhases =
    initialData?.phases?.map((p) => ({
      order: p.order,
      durationDays: p.durationDays === null ? '' : String(p.durationDays),
      dosage: p.dosage,
      isIndefinite: p.durationDays === null,
    })) ?? inferredPhases

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ScheduleFormInput>({
    resolver: standardSchemaResolver(scheduleFormStandardSchema),
    mode: 'onBlur',
    defaultValues: {
      name: initialData?.name ?? (inferredFromInjections ? `${inferredDrug} Schedule` : ''),
      drug: initialData?.drug ?? inferredDrug,
      frequency: initialData?.frequency ?? 'weekly',
      startDate: initialData ? toDateString(initialData.startDate) : inferredStartDate,
      notes: initialData?.notes ?? '',
      phases: initialPhases,
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'phases',
  })

  const drugsResult = useAtomValue(InjectionDrugsAtom)
  const userDrugs = Result.getOrElse(drugsResult, () => [])
  const allDrugs = [...new Set([...userDrugs, ...GLP1_DRUGS])]

  const addPhase = () => {
    const currentPhases = watch('phases')
    // If last phase was indefinite, make it definite when adding a new phase after it
    const lastIndex = currentPhases.length - 1
    if (lastIndex >= 0 && currentPhases[lastIndex]?.isIndefinite) {
      setValue(`phases.${lastIndex}.isIndefinite`, false)
      setValue(`phases.${lastIndex}.durationDays`, '28')
    }
    append({ order: currentPhases.length + 1, durationDays: '28', dosage: '', isIndefinite: false })
  }

  const removePhase = (index: number) => {
    remove(index)
    // Reorder remaining phases
    const currentPhases = watch('phases')
    currentPhases.forEach((_, i) => {
      setValue(`phases.${i}.order`, i + 1)
    })
  }

  const handleIndefiniteToggle = (index: number, checked: boolean) => {
    setValue(`phases.${index}.isIndefinite`, checked)
    setValue(`phases.${index}.durationDays`, checked ? '' : '28')
  }

  const onFormSubmit = async (data: ScheduleFormInput) => {
    const phasesData = data.phases.map(
      (p) =>
        new SchedulePhaseCreate({
          order: p.order as PhaseOrder,
          durationDays: p.isIndefinite ? null : (Number.parseInt(p.durationDays, 10) as PhaseDurationDays),
          dosage: Dosage.make(p.dosage),
        }),
    )

    if (isEditing && onUpdate && initialData) {
      await onUpdate(
        new InjectionScheduleUpdate({
          id: initialData.id as InjectionScheduleId,
          name: ScheduleName.make(data.name),
          drug: DrugName.make(data.drug),
          source: null, // Source is not required for schedules
          frequency: data.frequency,
          startDate: DateTime.unsafeMake(new Date(data.startDate)),
          notes: data.notes ? Notes.make(data.notes) : null,
          phases: phasesData,
        }),
      )
    } else {
      await onSubmit(
        new InjectionScheduleCreate({
          name: ScheduleName.make(data.name),
          drug: DrugName.make(data.drug),
          source: Option.none(), // Source is not required for schedules
          frequency: data.frequency,
          startDate: DateTime.unsafeMake(new Date(data.startDate)),
          notes: data.notes ? Option.some(Notes.make(data.notes)) : Option.none(),
          phases: phasesData,
        }),
      )
    }
  }

  const watchedPhases = watch('phases')
  const watchedName = watch('name')
  const watchedDrug = watch('drug')
  const watchedStartDate = watch('startDate')

  const isValid =
    watchedName.trim() &&
    watchedDrug.trim() &&
    watchedStartDate &&
    watchedPhases.every((p) => p.dosage.trim() && (p.isIndefinite || p.durationDays))

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
      <div className="mb-4">
        <Label htmlFor="name" className="mb-2 block">
          Schedule Name <span className="text-destructive">*</span>
        </Label>
        <Input
          type="text"
          id="name"
          {...register('name')}
          placeholder="e.g., Semaglutide Titration"
          error={!!errors.name}
        />
        {errors.name && <span className="block text-xs text-destructive mt-1">{errors.name.message}</span>}
      </div>

      <div className="mb-4">
        <Label htmlFor="drug" className="mb-2 block">
          Medication <span className="text-destructive">*</span>
        </Label>
        <Select id="drug" {...register('drug')} error={!!errors.drug}>
          <option value="">Select medication</option>
          {allDrugs.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        {errors.drug && <span className="block text-xs text-destructive mt-1">{errors.drug.message}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="frequency" className="mb-2 block">
            Frequency <span className="text-destructive">*</span>
          </Label>
          <Select id="frequency" {...register('frequency')}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="startDate" className="mb-2 block">
            Start Date <span className="text-destructive">*</span>
          </Label>
          <Input type="date" id="startDate" {...register('startDate')} error={!!errors.startDate} />
          {errors.startDate && <span className="block text-xs text-destructive mt-1">{errors.startDate.message}</span>}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <Label className="block">
            Titration Phases <span className="text-destructive">*</span>
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addPhase}>
            <Plus className="h-4 w-4 mr-1" />
            Add Phase
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Define each phase of your titration schedule. Duration is in days (28 = ~1 month). Mark the final phase as
          "Indefinite" for maintenance doses that continue indefinitely.
        </p>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium text-muted-foreground w-16">Phase {index + 1}</span>
              <div className="flex-1">
                <Input
                  type="text"
                  {...register(`phases.${index}.dosage`)}
                  placeholder="Dosage (e.g., 2.5mg)"
                  error={!!errors.phases?.[index]?.dosage}
                />
              </div>
              <div className="w-24">
                <Input
                  type="number"
                  {...register(`phases.${index}.durationDays`)}
                  placeholder="Days"
                  min={1}
                  disabled={watchedPhases[index]?.isIndefinite}
                  error={!!errors.phases?.[index]?.durationDays}
                />
              </div>
              {index === fields.length - 1 && (
                <label
                  className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer whitespace-nowrap"
                  title="Mark as ongoing maintenance phase with no end date"
                >
                  <input
                    type="checkbox"
                    checked={watchedPhases[index]?.isIndefinite ?? false}
                    onChange={(e) => handleIndefiniteToggle(index, e.target.checked)}
                    className="rounded border-muted-foreground/50"
                  />
                  Indefinite
                </label>
              )}
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => removePhase(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {errors.phases && typeof errors.phases.message === 'string' && (
          <span className="block text-xs text-destructive mt-2">{errors.phases.message}</span>
        )}
        {errors.phases &&
          Array.isArray(errors.phases) &&
          errors.phases.map(
            (phaseError, i) =>
              phaseError?.root?.message && (
                <span key={i} className="block text-xs text-destructive mt-2">
                  Phase {i + 1}: {phaseError.root.message}
                </span>
              ),
          )}
      </div>

      <div className="mb-4">
        <Label htmlFor="notes" className="mb-2 block">
          Notes
        </Label>
        <Textarea id="notes" {...register('notes')} rows={2} placeholder="Any additional instructions or notes..." />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !isValid}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Schedule' : 'Create Schedule'}
        </Button>
      </div>
    </form>
  )
}
