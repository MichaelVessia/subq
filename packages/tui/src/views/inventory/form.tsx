// Inventory form for add/edit

import { useKeyboard } from '@opentui/react'
import {
  InventoryCreate,
  InventoryUpdate,
  type DrugName,
  type DrugSource,
  type Inventory,
  type InventoryForm as InventoryFormType,
  type InventoryId,
  type InventoryStatus,
  type TotalAmount,
} from '@subq/shared'
import { DateTime, Option } from 'effect'
import { useCallback, useState } from 'react'
import { rpcCall } from '../../services/api-client'
import { theme } from '../../theme'

interface InventoryFormProps {
  item?: Inventory // If provided, we're editing
  onSave: () => void
  onCancel: () => void
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

type Field = 'drug' | 'source' | 'form' | 'totalAmount' | 'status' | 'beyondUseDate'

const fields: Field[] = ['drug', 'source', 'form', 'totalAmount', 'status', 'beyondUseDate']

export function InventoryForm({ item, onSave, onCancel, onMessage }: InventoryFormProps) {
  const [drug, setDrug] = useState(item?.drug ?? '')
  const [source, setSource] = useState(item?.source ?? '')
  const [form, setForm] = useState<'vial' | 'pen'>(item?.form ?? 'vial')
  const [totalAmount, setTotalAmount] = useState(item?.totalAmount ?? '')
  const [status, setStatus] = useState<'new' | 'opened' | 'finished'>(item?.status ?? 'new')
  const [beyondUseDate, setBeyondUseDate] = useState(
    item?.beyondUseDate ? (DateTime.toDate(item.beyondUseDate).toISOString().split('T')[0] ?? '') : '',
  )
  const [focusedField, setFocusedField] = useState<Field>('drug')
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!drug || !source || !totalAmount) {
      onMessage('Drug, source, and total amount are required', 'error')
      return
    }

    setSaving(true)
    try {
      if (item) {
        // Update
        await rpcCall((client) =>
          client.InventoryUpdate(
            new InventoryUpdate({
              id: item.id as InventoryId,
              drug: drug as DrugName,
              source: source as DrugSource,
              form: form as InventoryFormType,
              totalAmount: totalAmount as TotalAmount,
              status: status as InventoryStatus,
              beyondUseDate: beyondUseDate
                ? Option.some(DateTime.unsafeMake(new Date(beyondUseDate)))
                : Option.some(null),
            }),
          ),
        )
        onMessage('Inventory updated', 'success')
      } else {
        // Create
        await rpcCall((client) =>
          client.InventoryCreate(
            new InventoryCreate({
              drug: drug as DrugName,
              source: source as DrugSource,
              form: form as InventoryFormType,
              totalAmount: totalAmount as TotalAmount,
              status: status as InventoryStatus,
              beyondUseDate: beyondUseDate ? Option.some(DateTime.unsafeMake(new Date(beyondUseDate))) : Option.none(),
            }),
          ),
        )
        onMessage('Inventory added', 'success')
      }
      onSave()
    } catch (err) {
      onMessage(`Save failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
    setSaving(false)
  }, [drug, source, form, totalAmount, status, beyondUseDate, item, onSave, onMessage])

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
    } else if (
      focusedField === 'form' &&
      (key.name === 'left' || key.name === 'right' || key.name === 'h' || key.name === 'l')
    ) {
      // Toggle form between vial/pen
      setForm(form === 'vial' ? 'pen' : 'vial')
    } else if (focusedField === 'status' && (key.name === 'left' || key.name === 'h')) {
      // Cycle status backward
      const statuses: ('new' | 'opened' | 'finished')[] = ['new', 'opened', 'finished']
      const idx = statuses.indexOf(status)
      const newIdx = (idx - 1 + statuses.length) % statuses.length
      setStatus(statuses[newIdx] ?? 'new')
    } else if (focusedField === 'status' && (key.name === 'right' || key.name === 'l')) {
      // Cycle status forward
      const statuses: ('new' | 'opened' | 'finished')[] = ['new', 'opened', 'finished']
      const idx = statuses.indexOf(status)
      const newIdx = (idx + 1) % statuses.length
      setStatus(statuses[newIdx] ?? 'new')
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

  const renderSelect = (field: Field, label: string, value: string, options: string[]) => {
    const isFocused = focusedField === field
    return (
      <box style={{ flexDirection: 'column', marginBottom: 1 }}>
        <text fg={isFocused ? theme.accent : theme.textMuted}>{label}:</text>
        <box
          style={{
            borderStyle: 'single',
            borderColor: isFocused ? theme.borderFocused : theme.border,
            height: 3,
            paddingLeft: 1,
            alignItems: 'center',
          }}
        >
          <text fg={theme.text}>{options.map((opt) => (opt === value ? `[${opt}]` : ` ${opt} `)).join(' ')}</text>
        </box>
        {isFocused && <text fg={theme.textSubtle}>Use h/l or arrows to change</text>}
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      <text fg={theme.accent}>
        <strong>{item ? 'Edit Inventory' : 'New Inventory'}</strong>
      </text>

      <box style={{ marginTop: 1, flexDirection: 'column' }}>
        {renderField('drug', 'Drug *', drug, setDrug, 'e.g., Semaglutide')}
        {renderField('source', 'Source *', source, setSource, 'e.g., Empower Pharmacy')}
        {renderSelect('form', 'Form', form, ['vial', 'pen'])}
        {renderField('totalAmount', 'Total Amount *', totalAmount, setTotalAmount, 'e.g., 10mg')}
        {renderSelect('status', 'Status', status, ['new', 'opened', 'finished'])}
        {renderField('beyondUseDate', 'Beyond Use Date', beyondUseDate, setBeyondUseDate, 'YYYY-MM-DD (optional)')}
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
