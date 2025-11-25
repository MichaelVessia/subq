import { Result, useAtomValue } from '@effect-atom/atom-react'
import { InjectionLogCreate } from '@scale/shared'
import { Option } from 'effect'
import { useState } from 'react'
import { InjectionDrugsAtom, InjectionSitesAtom } from '../../rpc.js'

function toLocalDatetimeString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

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

export function InjectionLogForm({ onSubmit, onCancel, initialData }: InjectionLogFormProps) {
  const [datetime, setDatetime] = useState(toLocalDatetimeString(initialData?.datetime ?? new Date()))
  const [drug, setDrug] = useState(initialData?.drug ?? '')
  const [source, setSource] = useState(initialData?.source ?? '')
  const [dosage, setDosage] = useState(initialData?.dosage ?? '')
  const [injectionSite, setInjectionSite] = useState(initialData?.injectionSite ?? '')
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [loading, setLoading] = useState(false)

  const drugsResult = useAtomValue(InjectionDrugsAtom)
  const sitesResult = useAtomValue(InjectionSitesAtom)

  const drugSuggestions = Result.getOrElse(drugsResult, () => [])
  const siteSuggestions = Result.getOrElse(sitesResult, () => [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label htmlFor="datetime">Date & Time</label>
        <input
          type="datetime-local"
          id="datetime"
          value={datetime}
          onChange={(e) => setDatetime(e.target.value)}
          required
        />
      </div>

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label htmlFor="drug">Drug</label>
        <input
          type="text"
          id="drug"
          value={drug}
          onChange={(e) => setDrug(e.target.value)}
          list="drug-suggestions"
          required
          placeholder="e.g., Semaglutide"
        />
        <datalist id="drug-suggestions">
          {drugSuggestions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
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
          <label htmlFor="dosage">Dosage</label>
          <input
            type="text"
            id="dosage"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            required
            placeholder="e.g., 2.5mg"
          />
        </div>

        <div>
          <label htmlFor="source">Source (optional)</label>
          <input
            type="text"
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g., CVS"
          />
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label htmlFor="injectionSite">Injection Site (optional)</label>
        <input
          type="text"
          id="injectionSite"
          value={injectionSite}
          onChange={(e) => setInjectionSite(e.target.value)}
          list="site-suggestions"
          placeholder="e.g., left ventrogluteal"
        />
        <datalist id="site-suggestions">
          {siteSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <label htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  )
}
