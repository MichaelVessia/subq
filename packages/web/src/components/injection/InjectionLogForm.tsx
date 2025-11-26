import { Result, useAtomValue } from '@effect-atom/atom-react'
import {
  Dosage,
  DrugName,
  DrugSource,
  InjectionLogCreate,
  type InjectionLogId,
  InjectionLogUpdate,
  InjectionSite,
  type InventoryId,
  Notes,
} from '@scale/shared'
import { Option } from 'effect'
import { useCallback, useState } from 'react'
import { ActiveInventoryAtom, InjectionDrugsAtom, InjectionSitesAtom } from '../../rpc.js'
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
  }
}

interface FormErrors {
  datetime?: string | undefined
  drug?: string | undefined
  dosage?: string | undefined
}

export function InjectionLogForm({ onSubmit, onUpdate, onCancel, onMarkFinished, initialData }: InjectionLogFormProps) {
  const isEditing = !!initialData?.id
  const [datetime, setDatetime] = useState(toLocalDatetimeString(initialData?.datetime ?? new Date()))
  const [drug, setDrug] = useState(initialData?.drug ?? '')
  const [source, setSource] = useState(initialData?.source ?? '')
  const [dosage, setDosage] = useState(initialData?.dosage ?? '')
  const [injectionSite, setInjectionSite] = useState(initialData?.injectionSite ?? '')
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [finishVial, setFinishVial] = useState(false)
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('')

  const drugsResult = useAtomValue(InjectionDrugsAtom)
  const sitesResult = useAtomValue(InjectionSitesAtom)
  const inventoryResult = useAtomValue(ActiveInventoryAtom)

  const userDrugs = Result.getOrElse(drugsResult, () => [])
  const userSites = Result.getOrElse(sitesResult, () => [])
  const inventory = Result.getOrElse(inventoryResult, () => [])

  // Get active (non-finished) inventory items for current drug
  const activeInventory = inventory.filter((item) => item.status !== 'finished' && (!drug || item.drug === drug))

  const allDrugs = [...new Set([...userDrugs, ...GLP1_DRUGS.map((d) => d.name)])]
  const allSites = [...new Set([...userSites, ...INJECTION_SITES])]

  const selectedDrugInfo = GLP1_DRUGS.find((d) => d.name === drug || drug.toLowerCase().includes(d.name.toLowerCase()))
  const dosageSuggestions = selectedDrugInfo?.dosages ?? []

  const validateField = useCallback((field: string, value: string): string | undefined => {
    switch (field) {
      case 'datetime': {
        if (!value) return 'Date & time is required'
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return 'Invalid date'
        if (date > new Date()) return 'Cannot log future injections'
        return undefined
      }
      case 'drug': {
        if (!value.trim()) return 'Medication is required'
        if (value.trim().length < 2) return 'Enter a valid medication name'
        return undefined
      }
      case 'dosage': {
        if (!value.trim()) return 'Dosage is required'
        const dosagePattern = /^\d+(\.\d+)?\s*(mg|mcg|ml|units?|iu)$/i
        if (!dosagePattern.test(value.trim())) {
          return 'Enter dosage with unit (e.g., 2.5mg, 0.5ml)'
        }
        return undefined
      }
      default:
        return undefined
    }
  }, [])

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {
      datetime: validateField('datetime', datetime),
      drug: validateField('drug', drug),
      dosage: validateField('dosage', dosage),
    }
    setErrors(newErrors)
    return !newErrors.datetime && !newErrors.drug && !newErrors.dosage
  }, [datetime, drug, dosage, validateField])

  const handleBlur = (field: string, value: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    setErrors((prev) => ({ ...prev, [field]: validateField(field, value) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ datetime: true, drug: true, dosage: true })

    if (!validateForm()) return

    setLoading(true)
    try {
      if (isEditing && onUpdate && initialData?.id) {
        await onUpdate(
          new InjectionLogUpdate({
            id: initialData.id,
            datetime: new Date(datetime),
            drug: DrugName.make(drug),
            source: Option.some(source ? DrugSource.make(source) : null),
            dosage: Dosage.make(dosage),
            injectionSite: Option.some(injectionSite ? InjectionSite.make(injectionSite) : null),
            notes: Option.some(notes ? Notes.make(notes) : null),
          }),
        )
      } else {
        await onSubmit(
          new InjectionLogCreate({
            datetime: new Date(datetime),
            drug: DrugName.make(drug),
            source: source ? Option.some(DrugSource.make(source)) : Option.none(),
            dosage: Dosage.make(dosage),
            injectionSite: injectionSite ? Option.some(InjectionSite.make(injectionSite)) : Option.none(),
            notes: notes ? Option.some(Notes.make(notes)) : Option.none(),
          }),
        )
        // Mark inventory as finished if requested
        if (finishVial && selectedInventoryId && onMarkFinished) {
          await onMarkFinished(selectedInventoryId as InventoryId)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const isValid = !errors.datetime && !errors.drug && !errors.dosage && drug !== '' && dosage !== ''

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
        <Label htmlFor="drug" className="mb-2 block">
          Medication <span className="text-destructive">*</span>
        </Label>
        <Select
          id="drug"
          value={drug}
          onChange={(e) => {
            setDrug(e.target.value)
            if (touched.drug) {
              setErrors((prev) => ({ ...prev, drug: validateField('drug', e.target.value) }))
            }
          }}
          onBlur={(e) => handleBlur('drug', e.target.value)}
          error={touched.drug && !!errors.drug}
        >
          <option value="">Select medication</option>
          {allDrugs.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        {touched.drug && errors.drug && <span className="block text-xs text-destructive mt-1">{errors.drug}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="dosage" className="mb-2 block">
            Dosage <span className="text-destructive">*</span>
          </Label>
          <Input
            type="text"
            id="dosage"
            value={dosage}
            onChange={(e) => {
              setDosage(e.target.value)
              if (touched.dosage) {
                setErrors((prev) => ({ ...prev, dosage: validateField('dosage', e.target.value) }))
              }
            }}
            onBlur={(e) => handleBlur('dosage', e.target.value)}
            list="dosage-suggestions"
            placeholder="e.g., 2.5mg"
            error={touched.dosage && !!errors.dosage}
          />
          <datalist id="dosage-suggestions">
            {dosageSuggestions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          {touched.dosage && errors.dosage && (
            <span className="block text-xs text-destructive mt-1">{errors.dosage}</span>
          )}
        </div>

        <div>
          <Label htmlFor="source" className="mb-2 block">
            Source
          </Label>
          <Input
            type="text"
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g., CVS, Pharmacy"
          />
        </div>
      </div>

      <div className="mb-4">
        <Label htmlFor="injectionSite" className="mb-2 block">
          Injection Site
        </Label>
        <Select id="injectionSite" value={injectionSite} onChange={(e) => setInjectionSite(e.target.value)}>
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
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
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
              checked={finishVial}
              onChange={(e) => {
                setFinishVial(e.target.checked)
                if (!e.target.checked) setSelectedInventoryId('')
              }}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="finishVial" className="text-sm font-medium cursor-pointer">
              Finished a vial/pen with this injection?
            </Label>
          </div>
          {finishVial && (
            <Select
              id="inventorySelect"
              value={selectedInventoryId}
              onChange={(e) => setSelectedInventoryId(e.target.value)}
            >
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
        <Button type="submit" disabled={loading || !isValid}>
          {loading ? 'Saving...' : isEditing ? 'Update' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
