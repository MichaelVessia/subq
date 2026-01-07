// Weight form for add/edit

import { useKeyboard } from '@opentui/react'
import {
  WeightLogCreate,
  WeightLogUpdate,
  type Notes,
  type Weight,
  type WeightLog,
  type WeightLogId,
} from '@subq/shared'
import { DateTime, Option } from 'effect'
import { useCallback, useState } from 'react'
import { rpcCall } from '../../services/api-client'
import { theme } from '../../theme'

interface WeightFormProps {
  item?: WeightLog // If provided, we're editing
  onSave: () => void
  onCancel: () => void
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

type Field = 'weight' | 'date' | 'notes'

const fields: Field[] = ['weight', 'date', 'notes']

export function WeightForm({ item, onSave, onCancel, onMessage }: WeightFormProps) {
  const [weight, setWeight] = useState(item?.weight?.toString() ?? '')
  const [date, setDate] = useState(
    item
      ? (DateTime.toDate(item.datetime).toISOString().split('T')[0] ?? '')
      : (new Date().toISOString().split('T')[0] ?? ''),
  )
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [focusedField, setFocusedField] = useState<Field>('weight')
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    const weightNum = parseFloat(weight)
    if (!weight || Number.isNaN(weightNum) || weightNum <= 0) {
      onMessage('Weight is required and must be a positive number', 'error')
      return
    }

    setSaving(true)
    try {
      if (item) {
        // Update
        await rpcCall((client) =>
          client.WeightLogUpdate(
            new WeightLogUpdate({
              id: item.id as WeightLogId,
              weight: weightNum as Weight,
              datetime: DateTime.unsafeMake(new Date(date)),
              notes: notes ? Option.some(notes as Notes) : Option.some(null),
            }),
          ),
        )
        onMessage('Weight updated', 'success')
      } else {
        // Create
        await rpcCall((client) =>
          client.WeightLogCreate(
            new WeightLogCreate({
              weight: weightNum as Weight,
              datetime: DateTime.unsafeMake(new Date(date)),
              notes: notes ? Option.some(notes as Notes) : Option.none(),
            }),
          ),
        )
        onMessage('Weight added', 'success')
      }
      onSave()
    } catch (err) {
      onMessage(`Save failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
    setSaving(false)
  }, [weight, date, notes, item, onSave, onMessage])

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
        <strong>{item ? 'Edit Weight' : 'New Weight'}</strong>
      </text>

      <box style={{ marginTop: 1, flexDirection: 'column' }}>
        {renderField('weight', 'Weight (lbs) *', weight, setWeight, 'e.g., 185.5')}
        {renderField('date', 'Date', date, setDate, 'YYYY-MM-DD')}
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
