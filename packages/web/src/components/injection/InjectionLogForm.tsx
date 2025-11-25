import { useState, useEffect } from 'react'
import { Option } from 'effect'
import { InjectionLogCreate } from '@scale/shared'
import { rpcClient } from '../../rpc.js'

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
  const [datetime, setDatetime] = useState(
    initialData?.datetime?.toISOString().slice(0, 16) ?? new Date().toISOString().slice(0, 16),
  )
  const [drug, setDrug] = useState(initialData?.drug ?? '')
  const [source, setSource] = useState(initialData?.source ?? '')
  const [dosage, setDosage] = useState(initialData?.dosage ?? '')
  const [injectionSite, setInjectionSite] = useState(initialData?.injectionSite ?? '')
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [loading, setLoading] = useState(false)

  // Autocomplete suggestions
  const [drugSuggestions, setDrugSuggestions] = useState<readonly string[]>([])
  const [siteSuggestions, setSiteSuggestions] = useState<readonly string[]>([])

  useEffect(() => {
    rpcClient.injectionLog.getDrugs().then(setDrugSuggestions)
    rpcClient.injectionLog.getSites().then(setSiteSuggestions)
  }, [])

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
    <form onSubmit={handleSubmit} style={{ marginBottom: '1rem' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="datetime" style={{ display: 'block', marginBottom: '0.25rem' }}>
          Date & Time
        </label>
        <input
          type="datetime-local"
          id="datetime"
          value={datetime}
          onChange={(e) => setDatetime(e.target.value)}
          required
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="drug" style={{ display: 'block', marginBottom: '0.25rem' }}>
          Drug
        </label>
        <input
          type="text"
          id="drug"
          value={drug}
          onChange={(e) => setDrug(e.target.value)}
          list="drug-suggestions"
          required
          placeholder="e.g., Testosterone Cypionate"
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
        <datalist id="drug-suggestions">
          {drugSuggestions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="dosage" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Dosage
          </label>
          <input
            type="text"
            id="dosage"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            required
            placeholder="e.g., 200mg"
            style={{
              padding: '0.5rem',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label htmlFor="source" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Source (optional)
          </label>
          <input
            type="text"
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g., CVS"
            style={{
              padding: '0.5rem',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="injectionSite" style={{ display: 'block', marginBottom: '0.25rem' }}>
          Injection Site (optional)
        </label>
        <input
          type="text"
          id="injectionSite"
          value={injectionSite}
          onChange={(e) => setInjectionSite(e.target.value)}
          list="site-suggestions"
          placeholder="e.g., left ventrogluteal"
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
        <datalist id="site-suggestions">
          {siteSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="notes" style={{ display: 'block', marginBottom: '0.25rem' }}>
          Notes (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <button type="button" onClick={onCancel} style={{ padding: '0.5rem 1rem' }}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  )
}
