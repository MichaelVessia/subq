// Schedule view - displays injection schedules with titration phases
// Reads from local SQLite database via TuiDataLayer

import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import type { InjectionSchedule, SchedulePhase } from '@subq/shared'
import { InjectionScheduleId } from '@subq/shared'
import { DateTime } from 'effect'
import { useCallback, useMemo, useState } from 'react'
import { ConfirmModal } from '../../components/confirm-modal'
import { formatDate } from '../../lib/format'
import { rpcCall } from '../../services/api-client'
import { useSchedules } from '../../services/use-local-data'
import { theme, mocha } from '../../theme'

// Width threshold below which we show one schedule at a time (paged view)
const PAGED_WIDTH_THRESHOLD = 100

interface ScheduleViewProps {
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

// Format frequency for display
function formatFrequency(freq: string): string {
  const map: Record<string, string> = {
    daily: 'Daily',
    every_3_days: 'Every 3 days',
    weekly: 'Weekly',
    every_2_weeks: 'Bi-weekly',
    monthly: 'Monthly',
  }
  return map[freq] ?? freq
}

// Calculate total duration from phases
function formatDuration(schedule: InjectionSchedule): string {
  const totalDays = schedule.phases.reduce((sum, phase) => sum + (phase.durationDays ?? 0), 0)
  const hasIndefinitePhase = schedule.phases.some((p) => p.durationDays === null)
  if (hasIndefinitePhase) return 'Indefinite'
  if (totalDays === 0) return ''
  return `${totalDays} days total`
}

// Get phase symbol (simplified without completion status)
function getPhaseSymbol(phase: SchedulePhase, index: number): string {
  return `${index + 1}`
}

// Get phase color (simplified without completion status)
function getPhaseColor(_phase: SchedulePhase): string {
  return theme.textMuted
}

// Get phase background color (simplified)
function getPhaseBg(_phase: SchedulePhase): string {
  return theme.bgSurface
}

// Format phase duration
function formatPhaseDuration(phase: SchedulePhase): string {
  if (phase.durationDays === null) return '(ongoing)'
  return `for ${phase.durationDays} days`
}

// Truncate text to fit width
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text
  return text.slice(0, maxWidth - 1) + '…'
}

export function ScheduleView({ onMessage }: ScheduleViewProps) {
  const { width: termWidth } = useTerminalDimensions()
  const paged = termWidth < PAGED_WIDTH_THRESHOLD

  // Read from local database instead of RPC
  const {
    data: rawSchedules,
    loading,
    reload: loadSchedules,
  } = useSchedules({ onError: (msg) => onMessage(msg, 'error') })

  // Sort: active first, then by start date desc
  const schedules = useMemo(() => {
    if (!rawSchedules) return []
    return [...rawSchedules].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return DateTime.toDate(b.startDate).getTime() - DateTime.toDate(a.startDate).getTime()
    })
  }, [rawSchedules])

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<InjectionSchedule | null>(null)
  const [activateConfirm, setActivateConfirm] = useState<InjectionSchedule | null>(null)

  // Handle delete (still uses RPC for writes)
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return
    try {
      await rpcCall((client) => client.ScheduleDelete({ id: deleteConfirm.id as InjectionScheduleId }))
      onMessage('Schedule deleted', 'success')
      setDeleteConfirm(null)
      loadSchedules()
    } catch (err) {
      onMessage(`Delete failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }, [deleteConfirm, loadSchedules, onMessage])

  // Handle activate (still uses RPC for writes)
  const handleActivate = useCallback(async () => {
    if (!activateConfirm) return
    try {
      await rpcCall((client) =>
        client.ScheduleUpdate({
          id: activateConfirm.id as InjectionScheduleId,
          isActive: true,
        }),
      )
      onMessage(`Activated: ${activateConfirm.name}`, 'success')
      setActivateConfirm(null)
      loadSchedules()
    } catch (err) {
      onMessage(`Activate failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }, [activateConfirm, loadSchedules, onMessage])

  // Vim keybinds
  useKeyboard((key) => {
    if (deleteConfirm || activateConfirm) return // Modal handles its own keys

    const len = schedules.length

    if (key.name === 'j' || key.name === 'down') {
      setSelectedIndex((i) => Math.min(i + 1, len - 1))
    } else if (key.name === 'k' || key.name === 'up') {
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (key.name === 'g' && !key.shift) {
      setSelectedIndex(0)
    } else if (key.shift && key.name === 'g') {
      setSelectedIndex(Math.max(0, len - 1))
    } else if (key.ctrl && key.name === 'd') {
      setSelectedIndex((i) => Math.min(i + 5, len - 1))
    } else if (key.ctrl && key.name === 'u') {
      setSelectedIndex((i) => Math.max(i - 5, 0))
    } else if (key.name === 'return' || key.name === 'l') {
      // Expand/collapse
      const selected = schedules[selectedIndex]
      if (selected) {
        setExpandedId((id) => (id === selected.id ? null : selected.id))
      }
    } else if (key.name === 'h') {
      // Collapse
      setExpandedId(null)
    } else if (key.name === 'a') {
      // Activate
      const selected = schedules[selectedIndex]
      if (selected && !selected.isActive) {
        setActivateConfirm(selected)
      }
    } else if (key.name === 'd') {
      // Delete
      const selected = schedules[selectedIndex]
      if (selected) setDeleteConfirm(selected)
    } else if (key.name === 'r') {
      loadSchedules()
    }
  })

  if (loading) {
    return (
      <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
        <text fg={theme.textMuted}>Loading schedules...</text>
      </box>
    )
  }

  if (schedules.length === 0) {
    return (
      <box style={{ flexDirection: 'column', flexGrow: 1 }}>
        <box style={{ marginBottom: 1 }}>
          <text fg={theme.accent}>
            <strong>Injection Schedule</strong>
          </text>
        </box>
        <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
          <text fg={theme.textMuted}>No schedules. Create one on the web app.</text>
        </box>
        <box style={{ marginTop: 1 }}>
          <text fg={theme.textSubtle}>[r] Refresh</text>
        </box>
      </box>
    )
  }

  // Render a single schedule card
  const renderScheduleCard = (schedule: InjectionSchedule, idx: number) => {
    const isSelected = idx === selectedIndex
    const isExpanded = expandedId === schedule.id

    return (
      <box
        key={schedule.id}
        style={{
          flexDirection: 'column',
          borderStyle: 'single',
          borderColor: isSelected ? (schedule.isActive ? mocha.blue : theme.border) : theme.border,
          marginBottom: 1,
          padding: 1,
        }}
        backgroundColor={isSelected ? theme.bgSurface : theme.bg}
      >
        {/* Schedule header */}
        <box>
          <text fg={isSelected ? theme.text : theme.textMuted}>
            {`${isSelected && !paged ? '▸ ' : ''}${schedule.name}${schedule.isActive ? ' [Active]' : ''}`}
          </text>
        </box>

        {/* Drug and metadata */}
        <text fg={theme.textMuted}>
          {schedule.drug}
          {schedule.source ? ` (${schedule.source})` : ''}
        </text>

        <text fg={theme.textSubtle}>
          {paged
            ? `${formatFrequency(schedule.frequency)} · ${formatDuration(schedule)}`
            : `Started ${formatDate(schedule.startDate)} · ${formatFrequency(schedule.frequency)} · ${formatDuration(schedule)}`}
        </text>

        {/* Phases - always show summary */}
        {schedule.phases.length > 0 && (
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            {schedule.phases.map((phase, phaseIdx) => (
              <box
                key={phase.id}
                style={{
                  flexDirection: 'column',
                  padding: 0,
                  paddingLeft: 1,
                  paddingRight: 1,
                  marginBottom: 0,
                }}
                backgroundColor={getPhaseBg(phase)}
              >
                {/* Single text element to avoid TUI overlap bugs */}
                <box>
                  <text fg={getPhaseColor(phase)}>
                    {`${getPhaseSymbol(phase, phaseIdx).padStart(2)}  ${phase.dosage}  ${formatPhaseDuration(phase)}`}
                  </text>
                </box>
              </box>
            ))}
          </box>
        )}

        {/* Expanded details - hide in paged mode to avoid overflow */}
        {isExpanded && !paged && (
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            <box>
              <text fg={theme.border}>{'─'.repeat(Math.min(40, termWidth - 6))}</text>
            </box>
            <box>
              <text fg={theme.textSubtle}>Phases: {schedule.phases.length}</text>
            </box>
            {schedule.notes && (
              <box>
                <text fg={theme.textMuted}>
                  {truncateText(`Notes: ${schedule.notes.replace(/[\n\r]/g, ' ')}`, termWidth - 8)}
                </text>
              </box>
            )}
          </box>
        )}
      </box>
    )
  }

  // Paged view: show one schedule at a time
  if (paged) {
    const currentSchedule = schedules[selectedIndex]
    if (!currentSchedule) return null

    return (
      <box style={{ flexDirection: 'column', flexGrow: 1 }}>
        <text fg={theme.accent}>
          <strong>Schedule</strong>
        </text>

        <box style={{ flexDirection: 'column', flexGrow: 1, marginTop: 1 }}>
          {renderScheduleCard(currentSchedule, selectedIndex)}
        </box>

        <text fg={theme.textSubtle}>
          [{selectedIndex + 1}/{schedules.length}] j/k:nav r:refresh
        </text>
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1 }}>
      {/* Header */}
      <box style={{ marginBottom: 1 }}>
        <text fg={theme.accent}>
          <strong>Injection Schedule</strong>
        </text>
      </box>
      <box style={{ marginBottom: 1 }}>
        <text fg={theme.textMuted}>Manage your injection schedule and titration phases</text>
      </box>

      {/* Schedule list */}
      <box style={{ flexDirection: 'column', flexGrow: 1, overflow: 'scroll' }}>
        {schedules.map((schedule, idx) => renderScheduleCard(schedule, idx))}
      </box>

      {/* Keybind hints */}
      <box style={{ marginTop: 1 }}>
        <text fg={theme.textSubtle}>[j/k] Navigate [Enter/l] Expand [h] Collapse [r] Refresh</text>
      </box>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete Schedule"
          message={`Delete "${deleteConfirm.name}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Activate confirmation modal */}
      {activateConfirm && (
        <ConfirmModal
          title="Activate Schedule"
          message={`Activate "${activateConfirm.name}"? This will deactivate any other active schedule.`}
          onConfirm={handleActivate}
          onCancel={() => setActivateConfirm(null)}
        />
      )}
    </box>
  )
}
