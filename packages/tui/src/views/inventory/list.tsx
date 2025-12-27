// Inventory list view with vim keybinds

import { useKeyboard } from '@opentui/react'
import { InventoryListParams, type Inventory, type InventoryId } from '@subq/shared'
import { useCallback, useEffect, useState } from 'react'
import { ConfirmModal } from '../../components/confirm-modal'
import { DetailModal } from '../../components/detail-modal'
import { formatDateOrDash, pad } from '../../lib/format'
import { rpcCall } from '../../services/api-client'
import { theme } from '../../theme'

interface InventoryListViewProps {
  onNew: () => void
  onEdit: (item: Inventory) => void
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

export function InventoryListView({ onNew, onEdit, onMessage }: InventoryListViewProps) {
  const [items, setItems] = useState<readonly Inventory[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<Inventory | null>(null)
  const [detailView, setDetailView] = useState<Inventory | null>(null)
  const [filterText, setFilterText] = useState('')
  const [isFiltering, setIsFiltering] = useState(false)

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const result = await rpcCall((client) => client.InventoryList(new InventoryListParams({})))
      setItems(result)
    } catch (err) {
      onMessage(`Failed to load: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
    setLoading(false)
  }, [onMessage])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // Filter items
  const filteredItems = filterText
    ? items.filter(
        (i) =>
          i.drug.toLowerCase().includes(filterText.toLowerCase()) ||
          i.source.toLowerCase().includes(filterText.toLowerCase()),
      )
    : items

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return

    try {
      await rpcCall((client) => client.InventoryDelete({ id: deleteConfirm.id as InventoryId }))
      onMessage('Item deleted', 'success')
      setDeleteConfirm(null)
      loadItems()
    } catch (err) {
      onMessage(`Delete failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }, [deleteConfirm, loadItems, onMessage])

  // Handle mark opened
  const handleMarkOpened = useCallback(async () => {
    const selected = filteredItems[selectedIndex]
    if (!selected) return

    try {
      await rpcCall((client) => client.InventoryMarkOpened({ id: selected.id as InventoryId }))
      onMessage('Marked as opened', 'success')
      loadItems()
    } catch (err) {
      onMessage(`Failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }, [filteredItems, selectedIndex, loadItems, onMessage])

  // Handle mark finished
  const handleMarkFinished = useCallback(async () => {
    const selected = filteredItems[selectedIndex]
    if (!selected) return

    try {
      await rpcCall((client) => client.InventoryMarkFinished({ id: selected.id as InventoryId }))
      onMessage('Marked as finished', 'success')
      loadItems()
    } catch (err) {
      onMessage(`Failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }, [filteredItems, selectedIndex, loadItems, onMessage])

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

  // Column widths
  const COL = { drug: 20, amount: 10, status: 10, source: 18, form: 6, expiry: 14 }

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
          {pad('Source', COL.source)}
          {pad('Form', COL.form)}
          {pad('Expiry', COL.expiry)}
        </text>
      </box>
      <box style={{ paddingLeft: 1, marginBottom: 1 }}>
        <text fg={theme.border}>
          {'─'.repeat(COL.drug + COL.amount + COL.status + COL.source + COL.form + COL.expiry + 2)}
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
              <box key={item.id} style={{ paddingLeft: 1 }} backgroundColor={isSelected ? theme.bgSelected : theme.bg}>
                <text fg={isSelected ? theme.text : theme.textMuted}>
                  {isSelected ? '> ' : '  '}
                  {pad(item.drug, COL.drug)}
                  {pad(item.totalAmount, COL.amount)}
                  {pad(item.status, COL.status)}
                  {pad(item.source, COL.source)}
                  {pad(item.form, COL.form)}
                  {pad(formatDateOrDash(item.beyondUseDate), COL.expiry)}
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
