// Injections list view with vim keybinds

import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { InjectionLogListParams, Limit, type InjectionLog, type InjectionLogId } from '@subq/shared'
import { useCallback, useEffect, useState } from 'react'
import { ConfirmModal } from '../../components/confirm-modal'
import { DetailModal } from '../../components/detail-modal'
import { formatDate, pad } from '../../lib/format'
import { rpcCall } from '../../services/api-client'
import { theme } from '../../theme'

// Width threshold below which we hide the site column
const COMPACT_WIDTH_THRESHOLD = 70

interface InjectionListViewProps {
  onNew: () => void
  onEdit: (injection: InjectionLog) => void
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

export function InjectionListView({ onNew, onEdit, onMessage }: InjectionListViewProps) {
  const { width: termWidth } = useTerminalDimensions()
  const showSite = termWidth >= COMPACT_WIDTH_THRESHOLD

  const [injections, setInjections] = useState<readonly InjectionLog[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<InjectionLog | null>(null)
  const [detailView, setDetailView] = useState<InjectionLog | null>(null)
  const [filterText, setFilterText] = useState('')
  const [isFiltering, setIsFiltering] = useState(false)

  const loadInjections = useCallback(async () => {
    setLoading(true)
    try {
      const result = await rpcCall((client) =>
        client.InjectionLogList(new InjectionLogListParams({ limit: Limit.make(100) })),
      )
      setInjections(result)
    } catch (err) {
      onMessage(`Failed to load: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
    setLoading(false)
  }, [onMessage])

  useEffect(() => {
    loadInjections()
  }, [loadInjections])

  // Filter injections
  const filteredInjections = filterText
    ? injections.filter(
        (i) =>
          i.drug.toLowerCase().includes(filterText.toLowerCase()) ||
          i.dosage.toLowerCase().includes(filterText.toLowerCase()),
      )
    : injections

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return

    try {
      await rpcCall((client) => client.InjectionLogDelete({ id: deleteConfirm.id as InjectionLogId }))
      onMessage('Injection deleted', 'success')
      setDeleteConfirm(null)
      loadInjections()
    } catch (err) {
      onMessage(`Delete failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }, [deleteConfirm, loadInjections, onMessage])

  // Vim keybinds
  useKeyboard((key) => {
    if (deleteConfirm || detailView) return // Modal handles its own keys
    if (isFiltering) {
      if (key.name === 'escape' || key.name === 'return') {
        setIsFiltering(false)
      }
      return
    }

    const len = filteredInjections.length

    if (key.name === 'j' || key.name === 'down') {
      setSelectedIndex((i) => Math.min(i + 1, len - 1))
    } else if (key.name === 'k' || key.name === 'up') {
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (key.name === 'g' && !key.shift) {
      // gg - go to top (need double press detection, simplified to single g)
      setSelectedIndex(0)
    } else if (key.shift && key.name === 'g') {
      // G - go to bottom
      setSelectedIndex(Math.max(0, len - 1))
    } else if (key.ctrl && key.name === 'd') {
      // Page down
      setSelectedIndex((i) => Math.min(i + 10, len - 1))
    } else if (key.ctrl && key.name === 'u') {
      // Page up
      setSelectedIndex((i) => Math.max(i - 10, 0))
    } else if (key.name === 'o') {
      onNew()
    } else if (key.name === 'e' || key.name === 'i') {
      const selected = filteredInjections[selectedIndex]
      if (selected) onEdit(selected)
    } else if (key.name === 'd') {
      // dd - delete (simplified to single d)
      const selected = filteredInjections[selectedIndex]
      if (selected) setDeleteConfirm(selected)
    } else if (key.name === 'r') {
      loadInjections()
    } else if (key.name === '/') {
      setIsFiltering(true)
      setFilterText('')
    } else if (key.name === 'return') {
      const selected = filteredInjections[selectedIndex]
      if (selected) setDetailView(selected)
    }
  })

  // Column widths (responsive)
  const COL = showSite
    ? { date: 14, drug: Math.max(12, Math.floor((termWidth - 50) * 0.6)), dosage: 10, site: 16 }
    : { date: 14, drug: Math.max(12, termWidth - 40), dosage: 10, site: 0 }

  if (loading) {
    return (
      <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
        <text fg={theme.textMuted}>Loading injections...</text>
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
          <input placeholder="Filter by drug or dosage..." focused={isFiltering} onInput={setFilterText} />
        </box>
      )}

      {/* Table Header */}
      <box style={{ paddingLeft: 1, marginBottom: 0 }}>
        <text fg={theme.accent}>
          {'  '}
          {pad('Date', COL.date)}
          {pad('Drug', COL.drug)}
          {pad('Dosage', COL.dosage)}
          {showSite && pad('Site', COL.site)}
        </text>
      </box>
      <box style={{ paddingLeft: 1, marginBottom: 1 }}>
        <text fg={theme.border}>{'─'.repeat(COL.date + COL.drug + COL.dosage + (showSite ? COL.site : 0) + 2)}</text>
      </box>

      {/* List */}
      {filteredInjections.length === 0 ? (
        <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
          <text fg={theme.textMuted}>
            {filterText ? 'No matching injections' : 'No injections. Press o to add one.'}
          </text>
        </box>
      ) : (
        <box style={{ flexDirection: 'column', flexGrow: 1, overflow: 'scroll' }}>
          {filteredInjections.map((inj, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <box
                key={inj.id}
                style={{ paddingLeft: 1, height: 1 }}
                backgroundColor={isSelected ? theme.bgSelected : theme.bg}
              >
                <text fg={isSelected ? theme.text : theme.textMuted}>
                  {isSelected ? '> ' : '  '}
                  {pad(formatDate(inj.datetime), COL.date)}
                  {pad(inj.drug, COL.drug)}
                  {pad(inj.dosage, COL.dosage)}
                  {showSite && pad(inj.injectionSite ?? '-', COL.site)}
                </text>
              </box>
            )
          })}
        </box>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete Injection"
          message={`Delete ${deleteConfirm.drug} - ${deleteConfirm.dosage}?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Detail modal */}
      {detailView && (
        <DetailModal
          title="Injection Details"
          fields={[
            { label: 'Date', value: formatDate(detailView.datetime) },
            { label: 'Drug', value: detailView.drug },
            { label: 'Dosage', value: detailView.dosage },
            { label: 'Site', value: detailView.injectionSite ?? '-' },
            { label: 'Source', value: detailView.source ?? '-' },
            { label: 'Notes', value: detailView.notes ?? '-' },
          ]}
          onClose={() => setDetailView(null)}
        />
      )}
    </box>
  )
}
