// Weight list view with vim keybinds
// Reads from local SQLite database via TuiDataLayer
// Deletes use local database with outbox for sync

import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import type { WeightLog, WeightLogId } from '@subq/shared'
import { useCallback, useState } from 'react'
import { ConfirmModal } from '../../components/confirm-modal'
import { DetailModal } from '../../components/detail-modal'
import { formatDate, pad } from '../../lib/format'
import { useDeleteWeightLog, useWeightLogs } from '../../services/use-local-data'
import { theme } from '../../theme'

// Width threshold below which we hide the notes column
const COMPACT_WIDTH_THRESHOLD = 60

interface WeightListViewProps {
  onNew: () => void
  onEdit: (item: WeightLog) => void
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

export function WeightListView({ onNew, onEdit, onMessage }: WeightListViewProps) {
  const { width: termWidth } = useTerminalDimensions()
  const showNotes = termWidth >= COMPACT_WIDTH_THRESHOLD

  // Read from local database instead of RPC
  const { data: items, loading, reload: loadItems } = useWeightLogs({ onError: (msg) => onMessage(msg, 'error') })

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [deleteConfirm, setDeleteConfirm] = useState<WeightLog | null>(null)
  const [detailView, setDetailView] = useState<WeightLog | null>(null)

  // Local delete hook
  const deleteWeightLog = useDeleteWeightLog({ onError: (msg) => onMessage(msg, 'error') })

  const allItems = items ?? []

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return

    try {
      await deleteWeightLog(deleteConfirm.id as WeightLogId)
      onMessage('Entry deleted', 'success')
      setDeleteConfirm(null)
      loadItems()
    } catch (err) {
      onMessage(`Delete failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }, [deleteConfirm, loadItems, onMessage, deleteWeightLog])

  // Vim keybinds
  useKeyboard((key) => {
    if (deleteConfirm || detailView) return // Modal handles its own keys

    const len = allItems.length

    if (key.name === 'j' || key.name === 'down') {
      setSelectedIndex((i) => Math.min(i + 1, len - 1))
    } else if (key.name === 'k' || key.name === 'up') {
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (key.name === 'g' && !key.shift) {
      setSelectedIndex(0)
    } else if (key.shift && key.name === 'g') {
      setSelectedIndex(Math.max(0, len - 1))
    } else if (key.ctrl && key.name === 'd') {
      setSelectedIndex((i) => Math.min(i + 10, len - 1))
    } else if (key.ctrl && key.name === 'u') {
      setSelectedIndex((i) => Math.max(i - 10, 0))
    } else if (key.name === 'o') {
      onNew()
    } else if (key.name === 'e' || key.name === 'i') {
      const selected = allItems[selectedIndex]
      if (selected) onEdit(selected)
    } else if (key.name === 'd') {
      const selected = allItems[selectedIndex]
      if (selected) setDeleteConfirm(selected)
    } else if (key.name === 'r') {
      loadItems()
    } else if (key.name === 'return') {
      const selected = allItems[selectedIndex]
      if (selected) setDetailView(selected)
    }
  })

  // Column widths (responsive)
  const COL = showNotes
    ? { date: 14, weight: 12, notes: Math.max(10, termWidth - 30) }
    : { date: 14, weight: 12, notes: 0 }

  if (loading) {
    return (
      <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
        <text fg={theme.textMuted}>Loading weight logs...</text>
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1 }}>
      {/* Table Header */}
      <box style={{ paddingLeft: 1, marginBottom: 0 }}>
        <text fg={theme.accent}>
          {'  '}
          {pad('Date', COL.date)}
          {pad('Weight', COL.weight)}
          {showNotes && pad('Notes', COL.notes)}
        </text>
      </box>
      <box style={{ paddingLeft: 1, marginBottom: 1 }}>
        <text fg={theme.border}>{'─'.repeat(COL.date + COL.weight + (showNotes ? COL.notes : 0) + 2)}</text>
      </box>

      {/* List */}
      {allItems.length === 0 ? (
        <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
          <text fg={theme.textMuted}>No weight logs. Press o to add.</text>
        </box>
      ) : (
        <box style={{ flexDirection: 'column', flexGrow: 1, overflow: 'scroll' }}>
          {allItems.map((item, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <box
                key={item.id}
                style={{ paddingLeft: 1, height: 1 }}
                backgroundColor={isSelected ? theme.bgSelected : theme.bg}
              >
                <text fg={isSelected ? theme.text : theme.textMuted}>
                  {isSelected ? '> ' : '  '}
                  {pad(formatDate(item.datetime), COL.date)}
                  {pad(`${item.weight} lbs`, COL.weight)}
                  {showNotes && pad((item.notes ?? '-').replace(/[\n\r]/g, ' '), COL.notes)}
                </text>
              </box>
            )
          })}
        </box>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete Entry"
          message={`Delete ${deleteConfirm.weight} lbs on ${formatDate(deleteConfirm.datetime)}?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Detail modal */}
      {detailView && (
        <DetailModal
          title="Weight Log Details"
          fields={[
            { label: 'Date', value: formatDate(detailView.datetime) },
            { label: 'Weight', value: `${detailView.weight} lbs` },
            { label: 'Notes', value: detailView.notes ?? '-' },
          ]}
          onClose={() => setDetailView(null)}
        />
      )}
    </box>
  )
}
