import { Result, useAtomValue } from '@effect-atom/atom-react'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import {
  Dosage,
  DrugName,
  DrugSource,
  type InjectionSchedule,
  InjectionLogCreate,
  type InjectionLogId,
  InjectionLogUpdate,
  type InjectionScheduleId,
  InjectionSite,
  type InventoryId,
  Notes,
} from '@subq/shared'
import { DateTime, Option } from 'effect'
import { AlertTriangle } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { ActiveInventoryAtom, InjectionDrugsAtom, InjectionSitesAtom, ScheduleListAtom } from '../../rpc.js'
import { type InjectionLogFormInput, injectionLogFormStandardSchema } from '../../lib/form-schemas.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'
import { Select } from '../ui/select.js'
import { Textarea } from '../ui/textarea.js'

function toLocalDatetimeString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const GLP1_DRUGS = [
  { name: 'Semaglutide (Ozempic)', dosages: ['0.25mg', '0.5mg', '1mg', '2mg'] },
  { name: 'Semaglutide (Wegovy)', dosages: ['0.25mg', '0.5mg', '1mg', '1.7mg', '2.4mg'] },
  { name: 'Semaglutide (Compounded)', dosages: ['0.25mg', '0.5mg', '1mg', '1.7mg', '2mg', '2.4mg'] },
  { name: 'Tirzepatide (Mounjaro)', dosages: ['2.5mg', '5mg', '7.5mg', '10mg', '12.5mg', '15mg'] },
  { name: 'Tirzepatide (Zepbound)', dosages: ['2.5mg', '5mg', '7.5mg', '10mg', '12.5mg', '15mg'] },
  { name: 'Tirzepatide (Compounded)', dosages: ['2.5mg', '5mg', '7.5mg', '10mg', '12.5mg', '15mg'] },
  { name: 'Retatrutide (Compounded)', dosages: ['1mg', '2mg', '4mg', '8mg', '12mg'] },
  { name: 'Liraglutide (Saxenda)', dosages: ['0.6mg', '1.2mg', '1.8mg', '2.4mg', '3mg'] },
  { name: 'Dulaglutide (Trulicity)', dosages: ['0.75mg', '1.5mg', '3mg', '4.5mg'] },
]

const INJECTION_SITES = [
  'Left abdomen',
  'Right abdomen',
  'Left thigh',
  'Right thigh',
  'Left upper arm',
  'Right upper arm',
]

interface InjectionLogFormProps {
  onSubmit: (data: InjectionLogCreate) => Promise<void>
  onUpdate?: (data: InjectionLogUpdate) => Promise<void>
  onCancel: () => void
  onMarkFinished?: (inventoryId: InventoryId) => Promise<void>
  initialData?: {
    id?: InjectionLogId
    datetime?: Date
    drug?: string
    source?: string | null
    dosage?: string
    injectionSite?: string | null
    notes?: string | null
    scheduleId?: string
  }
}

export function InjectionLogForm({ onSubmit, onUpdate, onCancel, onMarkFinished, initialData }: InjectionLogFormProps) {
  const isEditing = !!initialData?.id

  const drugsResult = useAtomValue(InjectionDrugsAtom)
  const sitesResult = useAtomValue(InjectionSitesAtom)
  const inventoryResult = useAtomValue(ActiveInventoryAtom)
  const schedulesResult = useAtomValue(ScheduleListAtom)

  const userDrugs = Result.getOrElse(drugsResult, () => [])
  const userSites = Result.getOrElse(sitesResult, () => [])
  const inventory = Result.getOrElse(inventoryResult, () => [])
  const schedules = Result.getOrElse(schedulesResult, () => [] as InjectionSchedule[])

  const allDrugs = [...new Set([...userDrugs, ...GLP1_DRUGS.map((d) => d.name)])]
  const allSites = [...new Set([...userSites, ...INJECTION_SITES])]

  // Track selected schedule for auto-linking
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(initialData?.scheduleId ?? '')
  // Track if user is entering custom dosage (not from schedule)
  const [useCustomDosage, setUseCustomDosage] = useState(false)
  // Track if user confirmed off-schedule dose
  const [confirmedOffSchedule, setConfirmedOffSchedule] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InjectionLogFormInput>({
    resolver: standardSchemaResolver(injectionLogFormStandardSchema),
    mode: 'onBlur',
    defaultValues: {
      datetime: toLocalDatetimeString(initialData?.datetime ?? new Date()),
      drug: initialData?.drug ?? '',
      source: initialData?.source ?? '',
      dosage: initialData?.dosage ?? '',
      injectionSite: initialData?.injectionSite ?? '',
      notes: initialData?.notes ?? '',
      finishVial: false,
      selectedInventoryId: '',
    },
  })

  const drug = watch('drug')
  const dosage = watch('dosage')
  const finishVial = watch('finishVial')

  // Get active schedules for the selected drug
  const schedulesForDrug = useMemo(() => {
    if (!drug) return []
    return schedules.filter((s) => s.isActive && s.drug === drug)
  }, [schedules, drug])

  // Get selected schedule
  const selectedSchedule = useMemo(() => {
    return schedules.find((s) => s.id === selectedScheduleId) ?? null
  }, [schedules, selectedScheduleId])

  // Get unique dosages from selected schedule's phases
  const scheduleDosages = useMemo(() => {
    if (!selectedSchedule) return []
    return [...new Set(selectedSchedule.phases.map((p) => p.dosage))]
  }, [selectedSchedule])

  // Auto-select schedule when drug changes (if only one schedule for drug)
  // Skip if we already have a scheduleId from initialData
  useEffect(() => {
    // Don't override if initialData provided a scheduleId that matches a schedule for this drug
    const hasInitialScheduleForDrug =
      initialData?.scheduleId && schedulesForDrug.some((s) => s.id === initialData.scheduleId)

    if (hasInitialScheduleForDrug) {
      // Keep the initial schedule, just ensure state is set
      setSelectedScheduleId(initialData.scheduleId)
      setUseCustomDosage(false)
    } else if (schedulesForDrug.length === 1 && schedulesForDrug[0]) {
      setSelectedScheduleId(schedulesForDrug[0].id)
      setUseCustomDosage(false)
    } else if (schedulesForDrug.length === 0) {
      setSelectedScheduleId('')
      setUseCustomDosage(false)
    }
    // Reset confirmation when drug changes
    setConfirmedOffSchedule(false)
  }, [schedulesForDrug, initialData?.scheduleId])

  // Auto-populate source from schedule when schedule is selected
  useEffect(() => {
    if (selectedSchedule?.source && !isEditing) {
      setValue('source', selectedSchedule.source)
    }
  }, [selectedSchedule, setValue, isEditing])

  // Check if current dosage matches schedule
  const isOffScheduleDose = useMemo(() => {
    if (!selectedScheduleId || !dosage) return false
    return scheduleDosages.length > 0 && !scheduleDosages.includes(dosage)
  }, [selectedScheduleId, dosage, scheduleDosages])

  // Simple validity check for button enable state (matches original behavior)
  const hasRequiredFields = drug !== '' && dosage !== ''
  // Require confirmation if off-schedule
  const needsOffScheduleConfirmation = isOffScheduleDose && !confirmedOffSchedule

  // Get active (non-finished) inventory items for current drug
  const activeInventory = inventory.filter((item) => item.status !== 'finished' && (!drug || item.drug === drug))

  const selectedDrugInfo = GLP1_DRUGS.find((d) => d.name === drug || drug.toLowerCase().includes(d.name.toLowerCase()))
  // Fallback to generic suggestions only when no schedule
  const fallbackDosageSuggestions = selectedDrugInfo?.dosages ?? []

  const onFormSubmit = async (data: InjectionLogFormInput) => {
    // Determine scheduleId: use selected schedule (from dropdown or initial data)
    const effectiveScheduleId = selectedScheduleId || initialData?.scheduleId

    if (isEditing && onUpdate && initialData?.id) {
      await onUpdate(
        new InjectionLogUpdate({
          id: initialData.id,
          datetime: DateTime.unsafeMake(new Date(data.datetime)),
          drug: DrugName.make(data.drug),
          source: Option.some(data.source ? DrugSource.make(data.source) : null),
          dosage: Dosage.make(data.dosage),
          injectionSite: Option.some(data.injectionSite ? InjectionSite.make(data.injectionSite) : null),
          notes: Option.some(data.notes ? Notes.make(data.notes) : null),
          scheduleId: Option.none(), // Don't change scheduleId when editing via form
        }),
      )
    } else {
      await onSubmit(
        new InjectionLogCreate({
          datetime: DateTime.unsafeMake(new Date(data.datetime)),
          drug: DrugName.make(data.drug),
          source: data.source ? Option.some(DrugSource.make(data.source)) : Option.none(),
          dosage: Dosage.make(data.dosage),
          injectionSite: data.injectionSite ? Option.some(InjectionSite.make(data.injectionSite)) : Option.none(),
          notes: data.notes ? Option.some(Notes.make(data.notes)) : Option.none(),
          scheduleId: effectiveScheduleId ? Option.some(effectiveScheduleId as InjectionScheduleId) : Option.none(),
        }),
      )
      // Mark inventory as finished if requested
      if (data.finishVial && data.selectedInventoryId && onMarkFinished) {
        await onMarkFinished(data.selectedInventoryId as InventoryId)
      }
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

      {/* Schedule selection (when multiple schedules exist for drug) */}
      {schedulesForDrug.length > 1 && (
        <div className="mb-4">
          <Label htmlFor="schedule" className="mb-2 block">
            Link to Schedule
          </Label>
          <Select
            id="schedule"
            value={selectedScheduleId}
            onChange={(e) => {
              setSelectedScheduleId(e.target.value)
              setUseCustomDosage(false)
              setConfirmedOffSchedule(false)
            }}
          >
            <option value="">No schedule</option>
            {schedulesForDrug.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="dosage" className="mb-2 block">
            Dosage <span className="text-destructive">*</span>
          </Label>
          {/* Show dropdown when schedule has dosages and not using custom */}
          {scheduleDosages.length > 0 && !useCustomDosage ? (
            <div className="space-y-2">
              <Select
                id="dosage-select"
                value={dosage}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setUseCustomDosage(true)
                    setValue('dosage', '')
                  } else {
                    setValue('dosage', e.target.value)
                    setConfirmedOffSchedule(false)
                  }
                }}
              >
                <option value="">Select dosage</option>
                {scheduleDosages.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value="__custom__">Other (custom dosage)</option>
              </Select>
              {schedulesForDrug.length === 1 && schedulesForDrug[0] && (
                <p className="text-xs text-muted-foreground">From: {schedulesForDrug[0].name}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                type="text"
                id="dosage"
                {...register('dosage')}
                list="dosage-suggestions"
                placeholder="e.g., 2.5mg"
                error={!!errors.dosage}
                onChange={(e) => {
                  register('dosage').onChange(e)
                  setConfirmedOffSchedule(false)
                }}
              />
              <datalist id="dosage-suggestions">
                {fallbackDosageSuggestions.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
              {scheduleDosages.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    setUseCustomDosage(false)
                    setValue('dosage', '')
                  }}
                >
                  Use schedule dosages
                </button>
              )}
            </div>
          )}
          {errors.dosage && <span className="block text-xs text-destructive mt-1">{errors.dosage.message}</span>}
        </div>

        <div>
          <Label htmlFor="source" className="mb-2 block">
            Source
          </Label>
          <Input type="text" id="source" {...register('source')} placeholder="e.g., CVS, Pharmacy" />
        </div>
      </div>

      {/* Off-schedule dose warning */}
      {isOffScheduleDose && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-600">Off-schedule dosage</p>
              <p className="text-xs text-muted-foreground mt-1">
                This dosage ({dosage}) doesn't match your schedule phases ({scheduleDosages.join(', ')}).
              </p>
              {!confirmedOffSchedule && (
                <button
                  type="button"
                  className="mt-2 text-xs text-amber-600 hover:underline font-medium"
                  onClick={() => setConfirmedOffSchedule(true)}
                >
                  Log anyway
                </button>
              )}
              {confirmedOffSchedule && <p className="mt-1 text-xs text-amber-600">Confirmed - will log as entered</p>}
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <Label htmlFor="injectionSite" className="mb-2 block">
          Injection Site
        </Label>
        <Select id="injectionSite" {...register('injectionSite')}>
          <option value="">Select site (optional)</option>
          {allSites.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground mt-1">Rotating injection sites helps prevent lipodystrophy</p>
      </div>

      <div className="mb-4">
        <Label htmlFor="notes" className="mb-2 block">
          Notes
        </Label>
        <Textarea
          id="notes"
          {...register('notes')}
          rows={2}
          placeholder="Any side effects, observations, or reminders..."
        />
      </div>

      {!isEditing && activeInventory.length > 0 && (
        <div className="mb-5 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              id="finishVial"
              {...register('finishVial')}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="finishVial" className="text-sm font-medium cursor-pointer">
              Finished a vial/pen with this injection?
            </Label>
          </div>
          {finishVial && (
            <Select id="inventorySelect" {...register('selectedInventoryId')}>
              <option value="">Select inventory item to mark finished</option>
              {activeInventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.drug} - {item.totalAmount} ({item.source}) - {item.status}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !hasRequiredFields || needsOffScheduleConfirmation}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
