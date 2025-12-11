import { Result, useAtomValue } from '@effect-atom/atom-react'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import {
  Dosage,
  DrugName,
  DrugSource,
  InjectionLogCreate,
  type InjectionLogId,
  InjectionLogUpdate,
  type InjectionScheduleId,
  InjectionSite,
  type InventoryId,
  Notes,
} from '@subq/shared'
import { DateTime, Option } from 'effect'
import { useForm } from 'react-hook-form'
import { ActiveInventoryAtom, InjectionDrugsAtom, InjectionSitesAtom } from '../../rpc.js'
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

  const userDrugs = Result.getOrElse(drugsResult, () => [])
  const userSites = Result.getOrElse(sitesResult, () => [])
  const inventory = Result.getOrElse(inventoryResult, () => [])

  const allDrugs = [...new Set([...userDrugs, ...GLP1_DRUGS.map((d) => d.name)])]
  const allSites = [...new Set([...userSites, ...INJECTION_SITES])]

  const {
    register,
    handleSubmit,
    watch,
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

  // Simple validity check for button enable state (matches original behavior)
  const hasRequiredFields = drug !== '' && dosage !== ''

  // Get active (non-finished) inventory items for current drug
  const activeInventory = inventory.filter((item) => item.status !== 'finished' && (!drug || item.drug === drug))

  const selectedDrugInfo = GLP1_DRUGS.find((d) => d.name === drug || drug.toLowerCase().includes(d.name.toLowerCase()))
  const dosageSuggestions = selectedDrugInfo?.dosages ?? []

  const onFormSubmit = async (data: InjectionLogFormInput) => {
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
          scheduleId: initialData?.scheduleId
            ? Option.some(initialData.scheduleId as InjectionScheduleId)
            : Option.none(),
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

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="dosage" className="mb-2 block">
            Dosage <span className="text-destructive">*</span>
          </Label>
          <Input
            type="text"
            id="dosage"
            {...register('dosage')}
            list="dosage-suggestions"
            placeholder="e.g., 2.5mg"
            error={!!errors.dosage}
          />
          <datalist id="dosage-suggestions">
            {dosageSuggestions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          {errors.dosage && <span className="block text-xs text-destructive mt-1">{errors.dosage.message}</span>}
        </div>

        <div>
          <Label htmlFor="source" className="mb-2 block">
            Source
          </Label>
          <Input type="text" id="source" {...register('source')} placeholder="e.g., CVS, Pharmacy" />
        </div>
      </div>

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
        <Button type="submit" disabled={isSubmitting || !hasRequiredFields}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
