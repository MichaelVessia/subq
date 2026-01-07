// Injection form for add/edit

import { useKeyboard } from '@opentui/react'
import {
  InjectionLogCreate,
  InjectionLogUpdate,
  type Dosage,
  type DrugName,
  type DrugSource,
  type InjectionLog,
  type InjectionLogId,
  type InjectionSite,
  type Notes,
} from '@subq/shared'
import { DateTime, Option } from 'effect'
import { useCallback, useEffect, useState } from 'react'
import { rpcCall } from '../../services/api-client'
import { theme } from '../../theme'

interface InjectionFormProps {
  injection?: InjectionLog // If provided, we're editing
  onSave: () => void
  onCancel: () => void
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

type Field = 'drug' | 'dosage' | 'date' | 'site' | 'source' | 'notes'

const fields: Field[] = ['drug', 'dosage', 'date', 'site', 'source', 'notes']

export function InjectionForm({ injection, onSave, onCancel, onMessage }: InjectionFormProps) {
  const [drug, setDrug] = useState(injection?.drug ?? '')
  const [dosage, setDosage] = useState(injection?.dosage ?? '')
  const [date, setDate] = useState(
    injection
      ? (DateTime.toDate(injection.datetime).toISOString().split('T')[0] ?? '')
      : (new Date().toISOString().split('T')[0] ?? ''),
  )
  const [site, setSite] = useState(injection?.injectionSite ?? '')
  const [source, setSource] = useState(injection?.source ?? '')
  const [notes, setNotes] = useState(injection?.notes ?? '')
  const [focusedField, setFocusedField] = useState<Field>('drug')
  const [saving, setSaving] = useState(false)

  // Load suggestions
  const [drugSuggestions, setDrugSuggestions] = useState<string[]>([])
  const [siteSuggestions, setSiteSuggestions] = useState<string[]>([])

  useEffect(() => {
    // Load drug and site suggestions
    rpcCall((client) => client.InjectionLogGetDrugs())
      .then((drugs) => setDrugSuggestions([...drugs]))
      .catch(() => {})
    rpcCall((client) => client.InjectionLogGetSites())
      .then((sites) => setSiteSuggestions([...sites]))
      .catch(() => {})
  }, [])

  const handleSave = useCallback(async () => {
    if (!drug || !dosage) {
      onMessage('Drug and dosage are required', 'error')
      return
    }

    setSaving(true)
    try {
      if (injection) {
        // Update
        await rpcCall((client) =>
          client.InjectionLogUpdate(
            new InjectionLogUpdate({
              id: injection.id as InjectionLogId,
              drug: drug as DrugName,
              dosage: dosage as Dosage,
              datetime: DateTime.unsafeMake(new Date(date)),
              injectionSite: site ? Option.some(site as InjectionSite) : Option.some(null),
              source: source ? Option.some(source as DrugSource) : Option.some(null),
              notes: notes ? Option.some(notes as Notes) : Option.some(null),
              scheduleId: Option.none(),
            }),
          ),
        )
        onMessage('Injection updated', 'success')
      } else {
        // Create
        await rpcCall((client) =>
          client.InjectionLogCreate(
            new InjectionLogCreate({
              drug: drug as DrugName,
              dosage: dosage as Dosage,
              datetime: DateTime.unsafeMake(new Date(date)),
              injectionSite: site ? Option.some(site as InjectionSite) : Option.none(),
              source: source ? Option.some(source as DrugSource) : Option.none(),
              notes: notes ? Option.some(notes as Notes) : Option.none(),
              scheduleId: Option.none(),
            }),
          ),
        )
        onMessage('Injection added', 'success')
      }
      onSave()
    } catch (err) {
      onMessage(`Save failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
    setSaving(false)
  }, [drug, dosage, date, site, source, notes, injection, onSave, onMessage])

  useKeyboard((key) => {
    if (saving) return

    if (key.name === 'escape') {
      onCancel()
    } else if (key.ctrl && key.name === 's') {
      handleSave()
    } else if ((key.shift && key.name === 'tab') || (key.ctrl && key.name === 'p')) {
      // Previous field (check shift+tab before tab)
      const idx = fields.indexOf(focusedField)
      setFocusedField(fields[(idx - 1 + fields.length) % fields.length] as Field)
    } else if (key.name === 'tab' || (key.ctrl && key.name === 'n')) {
      // Next field
      const idx = fields.indexOf(focusedField)
      setFocusedField(fields[(idx + 1) % fields.length] as Field)
    }
  })

  const renderField = (
    field: Field,
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
  ) => {
    const isFocused = focusedField === field
    return (
      <box style={{ flexDirection: 'column', marginBottom: 1 }}>
        <text fg={isFocused ? theme.accent : theme.textMuted}>{label}:</text>
        <box
          style={{
            borderStyle: 'single',
            borderColor: isFocused ? theme.borderFocused : theme.border,
            height: 3,
          }}
        >
          <input value={value} placeholder={placeholder} focused={isFocused} onInput={onChange} />
        </box>
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      <text fg={theme.accent}>
        <strong>{injection ? 'Edit Injection' : 'New Injection'}</strong>
      </text>

      <box style={{ marginTop: 1, flexDirection: 'column' }}>
        {renderField(
          'drug',
          'Drug *',
          drug,
          setDrug,
          drugSuggestions.length > 0 ? `e.g., ${drugSuggestions[0]}` : 'e.g., Semaglutide',
        )}
        {renderField('dosage', 'Dosage *', dosage, setDosage, 'e.g., 0.5mg')}
        {renderField('date', 'Date', date, setDate, 'YYYY-MM-DD')}
        {renderField(
          'site',
          'Site',
          site,
          setSite,
          siteSuggestions.length > 0 ? `e.g., ${siteSuggestions[0]}` : 'e.g., left abdomen',
        )}
        {renderField('source', 'Source', source, setSource, 'e.g., Pharmacy name')}
        {renderField('notes', 'Notes', notes, setNotes, 'Optional notes...')}
      </box>

      <box style={{ marginTop: 1, flexDirection: 'row', gap: 4 }}>
        <text fg={theme.textSubtle}>Ctrl+S: Save</text>
        <text fg={theme.textSubtle}>Esc: Cancel</text>
        <text fg={theme.textSubtle}>Tab: Next field</text>
      </box>

      {saving && <text fg={theme.textMuted}>Saving...</text>}
    </box>
  )
}
