import { Result, useAtomValue } from '@effect-atom/atom-react'
import {
  Dosage,
  DrugName,
  DrugSource,
  type Frequency,
  type InjectionSchedule,
  InjectionScheduleCreate,
  type InjectionScheduleId,
  InjectionScheduleUpdate,
  Notes,
  type PhaseDurationDays,
  type PhaseOrder,
  ScheduleName,
  type SchedulePhaseCreate,
} from '@scale/shared'
import { Option } from 'effect'
import { Plus, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
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
  durationDays: string
  dosage: string
}

interface ScheduleFormProps {
  onSubmit: (data: InjectionScheduleCreate) => Promise<void>
  onUpdate?: (data: InjectionScheduleUpdate) => Promise<void>
  onCancel: () => void
  initialData?: InjectionSchedule
}

interface FormErrors {
  name?: string | undefined
  drug?: string | undefined
  frequency?: string | undefined
  startDate?: string | undefined
  phases?: string | undefined
}

export function ScheduleForm({ onSubmit, onUpdate, onCancel, initialData }: ScheduleFormProps) {
  const isEditing = !!initialData
  const [name, setName] = useState(initialData?.name ?? '')
  const [drug, setDrug] = useState(initialData?.drug ?? '')
  const [source, setSource] = useState(initialData?.source ?? '')
  const [frequency, setFrequency] = useState<Frequency>(initialData?.frequency ?? 'weekly')
  const [startDate, setStartDate] = useState(toLocalDateString(initialData?.startDate ?? new Date()))
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [phases, setPhases] = useState<PhaseInput[]>(
    initialData?.phases?.map((p) => ({
      order: p.order,
      durationDays: String(p.durationDays),
      dosage: p.dosage,
    })) ?? [{ order: 1, durationDays: '28', dosage: '' }],
  )
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const drugsResult = useAtomValue(InjectionDrugsAtom)
  const userDrugs = Result.getOrElse(drugsResult, () => [])
  const allDrugs = [...new Set([...userDrugs, ...GLP1_DRUGS])]

  const addPhase = () => {
    setPhases((prev) => [...prev, { order: prev.length + 1, durationDays: '28', dosage: '' }])
  }

  const removePhase = (index: number) => {
    setPhases((prev) => prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, order: i + 1 })))
  }

  const updatePhase = (index: number, field: keyof PhaseInput, value: string) => {
    setPhases((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  const validateField = useCallback((field: string, value: string): string | undefined => {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Schedule name is required'
        return undefined
      case 'drug':
        if (!value.trim()) return 'Medication is required'
        return undefined
      case 'startDate': {
        if (!value) return 'Start date is required'
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return 'Invalid date'
        return undefined
      }
      default:
        return undefined
    }
  }, [])

  const validatePhases = useCallback((): boolean => {
    for (const phase of phases) {
      if (!phase.dosage.trim()) {
        setErrors((prev) => ({ ...prev, phases: 'All phases must have a dosage' }))
        return false
      }
      const duration = Number.parseInt(phase.durationDays, 10)
      if (Number.isNaN(duration) || duration < 1) {
        setErrors((prev) => ({ ...prev, phases: 'All phases must have valid duration' }))
        return false
      }
    }
    setErrors((prev) => ({ ...prev, phases: undefined }))
    return true
  }, [phases])

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {
      name: validateField('name', name),
      drug: validateField('drug', drug),
      startDate: validateField('startDate', startDate),
    }
    setErrors(newErrors)
    const phasesValid = validatePhases()
    return !newErrors.name && !newErrors.drug && !newErrors.startDate && phasesValid
  }, [name, drug, startDate, validateField, validatePhases])

  const handleBlur = (field: string, value: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    setErrors((prev) => ({ ...prev, [field]: validateField(field, value) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, drug: true, startDate: true })

    if (!validateForm()) return

    setLoading(true)
    try {
      const phasesData: SchedulePhaseCreate[] = phases.map((p) => ({
        order: p.order as PhaseOrder,
        durationDays: Number.parseInt(p.durationDays, 10) as PhaseDurationDays,
        dosage: Dosage.make(p.dosage),
      }))

      if (isEditing && onUpdate && initialData) {
        await onUpdate(
          new InjectionScheduleUpdate({
            id: initialData.id as InjectionScheduleId,
            name: ScheduleName.make(name),
            drug: DrugName.make(drug),
            source: Option.some(source ? DrugSource.make(source) : null),
            frequency,
            startDate: new Date(startDate),
            notes: Option.some(notes ? Notes.make(notes) : null),
            phases: phasesData,
          }),
        )
      } else {
        await onSubmit(
          new InjectionScheduleCreate({
            name: ScheduleName.make(name),
            drug: DrugName.make(drug),
            source: source ? Option.some(DrugSource.make(source)) : Option.none(),
            frequency,
            startDate: new Date(startDate),
            notes: notes ? Option.some(Notes.make(notes)) : Option.none(),
            phases: phasesData,
          }),
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const isValid = name.trim() && drug.trim() && startDate && phases.every((p) => p.dosage.trim())

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <Label htmlFor="name" className="mb-2 block">
          Schedule Name <span className="text-destructive">*</span>
        </Label>
        <Input
          type="text"
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (touched.name) {
              setErrors((prev) => ({ ...prev, name: validateField('name', e.target.value) }))
            }
          }}
          onBlur={(e) => handleBlur('name', e.target.value)}
          placeholder="e.g., Semaglutide Titration"
          error={touched.name && !!errors.name}
        />
        {touched.name && errors.name && <span className="block text-xs text-destructive mt-1">{errors.name}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
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

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="frequency" className="mb-2 block">
            Frequency <span className="text-destructive">*</span>
          </Label>
          <Select id="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
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
          <Input
            type="date"
            id="startDate"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              if (touched.startDate) {
                setErrors((prev) => ({ ...prev, startDate: validateField('startDate', e.target.value) }))
              }
            }}
            onBlur={(e) => handleBlur('startDate', e.target.value)}
            error={touched.startDate && !!errors.startDate}
          />
          {touched.startDate && errors.startDate && (
            <span className="block text-xs text-destructive mt-1">{errors.startDate}</span>
          )}
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
          Define each phase of your titration schedule. Duration is in days (28 = ~1 month).
        </p>

        <div className="space-y-3">
          {phases.map((phase, index) => (
            <div key={phase.order} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium text-muted-foreground w-16">Phase {phase.order}</span>
              <div className="flex-1">
                <Input
                  type="text"
                  value={phase.dosage}
                  onChange={(e) => updatePhase(index, 'dosage', e.target.value)}
                  placeholder="Dosage (e.g., 2.5mg)"
                />
              </div>
              <div className="w-24">
                <Input
                  type="number"
                  value={phase.durationDays}
                  onChange={(e) => updatePhase(index, 'durationDays', e.target.value)}
                  placeholder="Days"
                  min={1}
                />
              </div>
              <span className="text-sm text-muted-foreground">days</span>
              {phases.length > 1 && (
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
        {errors.phases && <span className="block text-xs text-destructive mt-2">{errors.phases}</span>}
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
          placeholder="Any additional instructions or notes..."
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading || !isValid}>
          {loading ? 'Saving...' : isEditing ? 'Update Schedule' : 'Create Schedule'}
        </Button>
      </div>
    </form>
  )
}
