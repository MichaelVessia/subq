// Inventory list view with vim keybinds
// Reads from local SQLite database via TuiDataLayer
// Writes use local database with outbox for sync

import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import type { Inventory, InventoryId } from '@subq/shared'
import { useCallback, useState } from 'react'
import { ConfirmModal } from '../../components/confirm-modal'
import { DetailModal } from '../../components/detail-modal'
import { formatDateOrDash, pad } from '../../lib/format'
import {
  useDeleteInventory,
  useInventory,
  useMarkInventoryFinished,
  useMarkInventoryOpened,
} from '../../services/use-local-data'
import { theme } from '../../theme'

// Width threshold below which we hide secondary columns (source, form, expiry)
const COMPACT_WIDTH_THRESHOLD = 80

interface InventoryListViewProps {
  onNew: () => void
  onEdit: (item: Inventory) => void
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

export function InventoryListView({ onNew, onEdit, onMessage }: InventoryListViewProps) {
  const { width: termWidth } = useTerminalDimensions()
  const showExtras = termWidth >= COMPACT_WIDTH_THRESHOLD

  // Read from local database instead of RPC
  const { data: items, loading, reload: loadItems } = useInventory({}, { onError: (msg) => onMessage(msg, 'error') })

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [deleteConfirm, setDeleteConfirm] = useState<Inventory | null>(null)
  const [detailView, setDetailView] = useState<Inventory | null>(null)
  const [filterText, setFilterText] = useState('')
  const [isFiltering, setIsFiltering] = useState(false)

  // Local write hooks
  const deleteInventory = useDeleteInventory({ onError: (msg) => onMessage(msg, 'error') })
  const markInventoryOpened = useMarkInventoryOpened({ onError: (msg) => onMessage(msg, 'error') })
  const markInventoryFinished = useMarkInventoryFinished({ onError: (msg) => onMessage(msg, 'error') })

  // Filter items
  const allItems = items ?? []
  const filteredItems = filterText
    ? allItems.filter(
        (i) =>
          i.drug.toLowerCase().includes(filterText.toLowerCase()) ||
          i.source.toLowerCase().includes(filterText.toLowerCase()),
      )
    : allItems

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return

    try {
      await deleteInventory(deleteConfirm.id as InventoryId)
      onMessage('Item deleted', 'success')
      setDeleteConfirm(null)
      loadItems()
    } catch (err) {
      onMessage(`Delete failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }, [deleteConfirm, loadItems, onMessage, deleteInventory])

  // Handle mark opened
  const handleMarkOpened = useCallback(async () => {
    const selected = filteredItems[selectedIndex]
    if (!selected) return

    try {
      await markInventoryOpened(selected.id as InventoryId)
      onMessage('Marked as opened', 'success')
      loadItems()
    } catch (err) {
      onMessage(`Failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }, [filteredItems, selectedIndex, loadItems, onMessage, markInventoryOpened])

  // Handle mark finished
  const handleMarkFinished = useCallback(async () => {
    const selected = filteredItems[selectedIndex]
    if (!selected) return

    try {
      await markInventoryFinished(selected.id as InventoryId)
      onMessage('Marked as finished', 'success')
      loadItems()
    } catch (err) {
      onMessage(`Failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }, [filteredItems, selectedIndex, loadItems, onMessage, markInventoryFinished])

  // Track for 'mo' and 'mf' sequences
  const [pendingM, setPendingM] = useState(false)

  // Vim keybinds
  useKeyboard((key) => {
    if (deleteConfirm || detailView) return // Modal handles its own keys
    if (isFiltering) {
      if (key.name === 'escape' || key.name === 'return') {
        setIsFiltering(false)
      }
      return
    }

    const len = filteredItems.length

    // Handle m+key sequences for 'mo' and 'mf'
    if (pendingM) {
      setPendingM(false)
      if (key.name === 'o') {
        handleMarkOpened()
        return
      } else if (key.name === 'f') {
        handleMarkFinished()
        return
      }
    }

    if (key.name === 'm') {
      setPendingM(true)
      return
    }

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
      const selected = filteredItems[selectedIndex]
      if (selected) onEdit(selected)
    } else if (key.name === 'd') {
      const selected = filteredItems[selectedIndex]
      if (selected) setDeleteConfirm(selected)
    } else if (key.name === 'r') {
      loadItems()
    } else if (key.name === '/') {
      setIsFiltering(true)
      setFilterText('')
    } else if (key.name === 'return') {
      const selected = filteredItems[selectedIndex]
      if (selected) setDetailView(selected)
    }
  })

  // Column widths (responsive)
  const COL = showExtras
    ? { drug: 20, amount: 10, status: 10, source: 18, form: 6, expiry: 14 }
    : { drug: Math.max(12, termWidth - 35), amount: 10, status: 10, source: 0, form: 0, expiry: 0 }

  if (loading) {
    return (
      <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
        <text fg={theme.textMuted}>Loading inventory...</text>
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1 }}>
      {/* Filter bar */}
      {isFiltering && (
        <box
          style={{
            borderStyle: 'single',
            borderColor: theme.accent,
            height: 3,
            marginBottom: 1,
          }}
        >
          <input placeholder="Filter by drug or source..." focused={isFiltering} onInput={setFilterText} />
        </box>
      )}

      {/* Hint for mo/mf */}
      <box style={{ marginBottom: 0 }}>
        <text fg={theme.textSubtle}>mo: mark opened | mf: mark finished</text>
      </box>

      {/* Table Header */}
      <box style={{ paddingLeft: 1, marginTop: 1, marginBottom: 0 }}>
        <text fg={theme.accent}>
          {'  '}
          {pad('Drug', COL.drug)}
          {pad('Amount', COL.amount)}
          {pad('Status', COL.status)}
          {showExtras && pad('Source', COL.source)}
          {showExtras && pad('Form', COL.form)}
          {showExtras && pad('Expiry', COL.expiry)}
        </text>
      </box>
      <box style={{ paddingLeft: 1, marginBottom: 1 }}>
        <text fg={theme.border}>
          {'─'.repeat(COL.drug + COL.amount + COL.status + (showExtras ? COL.source + COL.form + COL.expiry : 0) + 2)}
        </text>
      </box>

      {/* List */}
      {filteredItems.length === 0 ? (
        <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
          <text fg={theme.textMuted}>{filterText ? 'No matching items' : 'No inventory. Press o to add.'}</text>
        </box>
      ) : (
        <box style={{ flexDirection: 'column', flexGrow: 1, overflow: 'scroll' }}>
          {filteredItems.map((item, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <box
                key={item.id}
                style={{ paddingLeft: 1, height: 1 }}
                backgroundColor={isSelected ? theme.bgSelected : theme.bg}
              >
                <text fg={isSelected ? theme.text : theme.textMuted}>
                  {isSelected ? '> ' : '  '}
                  {pad(item.drug, COL.drug)}
                  {pad(item.totalAmount, COL.amount)}
                  {pad(item.status, COL.status)}
                  {showExtras && pad(item.source, COL.source)}
                  {showExtras && pad(item.form, COL.form)}
                  {showExtras && pad(formatDateOrDash(item.beyondUseDate), COL.expiry)}
                </text>
              </box>
            )
          })}
        </box>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete Item"
          message={`Delete ${deleteConfirm.drug} - ${deleteConfirm.totalAmount}?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Detail modal */}
      {detailView && (
        <DetailModal
          title="Inventory Details"
          fields={[
            { label: 'Drug', value: detailView.drug },
            { label: 'Total Amount', value: detailView.totalAmount },
            { label: 'Status', value: detailView.status },
            { label: 'Source', value: detailView.source },
            { label: 'Form', value: detailView.form },
            { label: 'Beyond Use Date', value: formatDateOrDash(detailView.beyondUseDate) },
          ]}
          onClose={() => setDetailView(null)}
        />
      )}
    </box>
  )
}
