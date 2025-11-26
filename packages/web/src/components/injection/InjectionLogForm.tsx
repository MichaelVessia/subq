import { Result, useAtomValue } from '@effect-atom/atom-react'
import { InjectionLogCreate } from '@scale/shared'
import { Option } from 'effect'
import { useCallback, useState } from 'react'
import { InjectionDrugsAtom, InjectionSitesAtom } from '../../rpc.js'

function toLocalDatetimeString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

// Common GLP-1 medications with typical dosage progressions
const GLP1_DRUGS = [
  { name: 'Semaglutide (Ozempic)', dosages: ['0.25mg', '0.5mg', '1mg', '2mg'] },
  { name: 'Semaglutide (Wegovy)', dosages: ['0.25mg', '0.5mg', '1mg', '1.7mg', '2.4mg'] },
  { name: 'Tirzepatide (Mounjaro)', dosages: ['2.5mg', '5mg', '7.5mg', '10mg', '12.5mg', '15mg'] },
  { name: 'Tirzepatide (Zepbound)', dosages: ['2.5mg', '5mg', '7.5mg', '10mg', '12.5mg', '15mg'] },
  { name: 'Liraglutide (Saxenda)', dosages: ['0.6mg', '1.2mg', '1.8mg', '2.4mg', '3mg'] },
  { name: 'Dulaglutide (Trulicity)', dosages: ['0.75mg', '1.5mg', '3mg', '4.5mg'] },
]

// Standard subcutaneous injection sites
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
  onCancel: () => void
  initialData?: {
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

export function InjectionLogForm({ onSubmit, onCancel, initialData }: InjectionLogFormProps) {
  const [datetime, setDatetime] = useState(toLocalDatetimeString(initialData?.datetime ?? new Date()))
  const [drug, setDrug] = useState(initialData?.drug ?? '')
  const [source, setSource] = useState(initialData?.source ?? '')
  const [dosage, setDosage] = useState(initialData?.dosage ?? '')
  const [injectionSite, setInjectionSite] = useState(initialData?.injectionSite ?? '')
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const drugsResult = useAtomValue(InjectionDrugsAtom)
  const sitesResult = useAtomValue(InjectionSitesAtom)

  // Combine user's previously used drugs with common GLP-1 drugs
  const userDrugs = Result.getOrElse(drugsResult, () => [])
  const userSites = Result.getOrElse(sitesResult, () => [])

  // All drug suggestions: user's drugs first, then common ones not already in user's list
  const allDrugs = [...new Set([...userDrugs, ...GLP1_DRUGS.map((d) => d.name)])]

  // All site suggestions: user's sites first, then standard ones not already in user's list
  const allSites = [...new Set([...userSites, ...INJECTION_SITES])]

  // Get suggested dosages based on selected drug
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
        // Validate dosage format (number followed by unit)
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

    // Mark all required fields as touched
    setTouched({ datetime: true, drug: true, dosage: true })

    if (!validateForm()) return

    setLoading(true)
    try {
      await onSubmit(
        new InjectionLogCreate({
          datetime: new Date(datetime),
          drug,
          source: source ? Option.some(source) : Option.none(),
          dosage,
          injectionSite: injectionSite ? Option.some(injectionSite) : Option.none(),
          notes: notes ? Option.some(notes) : Option.none(),
        }),
      )
    } finally {
      setLoading(false)
    }
  }

  const isValid = !errors.datetime && !errors.drug && !errors.dosage && drug !== '' && dosage !== ''

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

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label htmlFor="drug">
          Medication <span className="required-mark">*</span>
        </label>
        <input
          type="text"
          id="drug"
          value={drug}
          onChange={(e) => {
            setDrug(e.target.value)
            if (touched.drug) {
              setErrors((prev) => ({ ...prev, drug: validateField('drug', e.target.value) }))
            }
          }}
          onBlur={(e) => handleBlur('drug', e.target.value)}
          list="drug-suggestions"
          placeholder="Select or type medication name"
          className={touched.drug && errors.drug ? 'input-error' : ''}
        />
        <datalist id="drug-suggestions">
          {allDrugs.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        {touched.drug && errors.drug && <span className="field-error">{errors.drug}</span>}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div>
          <label htmlFor="dosage">
            Dosage <span className="required-mark">*</span>
          </label>
          <input
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
            className={touched.dosage && errors.dosage ? 'input-error' : ''}
          />
          <datalist id="dosage-suggestions">
            {dosageSuggestions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          {touched.dosage && errors.dosage && <span className="field-error">{errors.dosage}</span>}
        </div>

        <div>
          <label htmlFor="source">Source</label>
          <input
            type="text"
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g., CVS, Pharmacy"
          />
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label htmlFor="injectionSite">Injection Site</label>
        <select id="injectionSite" value={injectionSite} onChange={(e) => setInjectionSite(e.target.value)}>
          <option value="">Select site (optional)</option>
          {allSites.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <p className="field-hint">Rotating injection sites helps prevent lipodystrophy</p>
      </div>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Any side effects, observations, or reminders..."
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
