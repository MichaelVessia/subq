// Schedule view - displays injection schedules with titration phases

import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import type { InjectionSchedule, SchedulePhaseView, ScheduleView as ScheduleViewType } from '@subq/shared'
import { InjectionScheduleId } from '@subq/shared'
import { DateTime } from 'effect'
import { useCallback, useEffect, useState } from 'react'
import { ConfirmModal } from '../../components/confirm-modal'
import { formatDate } from '../../lib/format'
import { rpcCall } from '../../services/api-client'
import { theme, mocha } from '../../theme'

// Width threshold below which we use compact layout
const COMPACT_WIDTH_THRESHOLD = 80

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

// Calculate total duration
function formatDuration(schedule: ScheduleViewType): string {
  if (schedule.endDate === null) return 'Indefinite'
  const start = DateTime.toDate(schedule.startDate)
  const end = DateTime.toDate(schedule.endDate)
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return `${days} days total`
}

// Get phase status symbol
function getPhaseSymbol(phase: SchedulePhaseView): string {
  if (phase.status === 'completed') return '✓'
  if (phase.status === 'current') return `${phase.completedInjections}`
  return '○'
}

// Get phase status color
function getPhaseColor(phase: SchedulePhaseView): string {
  if (phase.status === 'completed') return mocha.green
  if (phase.status === 'current') return mocha.blue
  return theme.textMuted
}

// Get phase background color
function getPhaseBg(phase: SchedulePhaseView): string {
  if (phase.status === 'completed') return '#2a3d2a' // dark green tint
  if (phase.status === 'current') return '#2a2d3d' // dark blue tint
  return theme.bgSurface
}

// Format phase duration
function formatPhaseDuration(phase: SchedulePhaseView): string {
  if (phase.durationDays === null) return '(ongoing)'
  return `for ${phase.durationDays} days`
}

export function ScheduleView({ onMessage }: ScheduleViewProps) {
  const { width: termWidth } = useTerminalDimensions()
  const compact = termWidth < COMPACT_WIDTH_THRESHOLD

  const [schedules, setSchedules] = useState<readonly InjectionSchedule[]>([])
  const [scheduleViews, setScheduleViews] = useState<Map<string, ScheduleViewType>>(new Map())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<InjectionSchedule | null>(null)
  const [activateConfirm, setActivateConfirm] = useState<InjectionSchedule | null>(null)

  const loadSchedules = useCallback(async () => {
    setLoading(true)
    try {
      const result = await rpcCall((client) => client.ScheduleList())
      // Sort: active first, then by start date desc
      const sorted = [...result].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        return DateTime.toDate(b.startDate).getTime() - DateTime.toDate(a.startDate).getTime()
      })
      setSchedules(sorted)

      // Load views for all schedules
      const views = new Map<string, ScheduleViewType>()
      for (const schedule of sorted) {
        try {
          const view = await rpcCall((client) => client.ScheduleGetView({ id: schedule.id as InjectionScheduleId }))
          if (view) views.set(schedule.id, view)
        } catch {
          // Skip failed views
        }
      }
      setScheduleViews(views)
    } catch (err) {
      onMessage(`Failed to load: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
    setLoading(false)
  }, [onMessage])

  useEffect(() => {
    loadSchedules()
  }, [loadSchedules])

  // Handle delete
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

  // Handle activate
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

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1 }}>
      {/* Header */}
      <box style={{ marginBottom: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
        <box style={{ flexDirection: 'column' }}>
          <text fg={theme.accent}>
            <strong>Injection Schedule</strong>
          </text>
          <text fg={theme.textMuted}>Manage your injection schedule and titration phases</text>
        </box>
      </box>

      {/* Schedule list */}
      <box style={{ flexDirection: 'column', flexGrow: 1, overflow: 'scroll' }}>
        {schedules.map((schedule, idx) => {
          const isSelected = idx === selectedIndex
          const isExpanded = expandedId === schedule.id
          const view = scheduleViews.get(schedule.id)

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
              <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <box style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <text fg={isSelected ? theme.text : theme.textMuted}>
                    {isSelected ? '▸ ' : '  '}
                    <strong>{schedule.name}</strong>
                  </text>
                  {schedule.isActive && <text fg={mocha.green}> [Active]</text>}
                </box>
                {!compact && <text fg={theme.textSubtle}>{!schedule.isActive && '[a] Activate  '}[d] Delete</text>}
              </box>

              {/* Drug and metadata */}
              <text fg={theme.textMuted}>
                {schedule.drug}
                {schedule.source ? ` (${schedule.source})` : ''}
              </text>

              {compact ? (
                <box style={{ flexDirection: 'column' }}>
                  <text fg={theme.textSubtle}>Started {formatDate(schedule.startDate)}</text>
                  <text fg={theme.textSubtle}>
                    {formatFrequency(schedule.frequency)}
                    {view ? ` · ${formatDuration(view)}` : ''}
                  </text>
                </box>
              ) : (
                <text fg={theme.textSubtle}>
                  Started {formatDate(schedule.startDate)} · {formatFrequency(schedule.frequency)}
                  {view ? ` · ${formatDuration(view)}` : ''}
                </text>
              )}

              {/* Phases - always show summary, expand for details */}
              {view && (
                <box style={{ flexDirection: 'column', marginTop: 1 }}>
                  {view.phases.map((phase) => (
                    <box
                      key={phase.id}
                      style={{
                        flexDirection: 'row',
                        padding: 0,
                        paddingLeft: 1,
                        paddingRight: 1,
                        marginBottom: 0,
                      }}
                      backgroundColor={getPhaseBg(phase)}
                    >
                      <text fg={getPhaseColor(phase)}>{getPhaseSymbol(phase).padStart(2)}</text>
                      <text fg={theme.text}>
                        {'  '}
                        <strong>{phase.dosage}</strong>
                      </text>
                      <text fg={theme.textMuted}>
                        {'  '}
                        {formatPhaseDuration(phase)}
                      </text>
                    </box>
                  ))}
                </box>
              )}

              {/* Expanded details */}
              {isExpanded && view && (
                <box style={{ flexDirection: 'column', marginTop: 1 }}>
                  <text fg={theme.border}>{'─'.repeat(40)}</text>
                  <text fg={theme.textSubtle}>
                    Progress: {view.totalCompletedInjections}
                    {view.totalExpectedInjections !== null
                      ? ` / ${view.totalExpectedInjections} injections`
                      : ' injections (indefinite)'}
                  </text>
                  {schedule.notes && <text fg={theme.textMuted}>Notes: {schedule.notes.replace(/[\n\r]/g, ' ')}</text>}
                </box>
              )}
            </box>
          )
        })}
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
