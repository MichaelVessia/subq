// Status bar component showing contextual keybinds and sync status

import { useEffect, useState } from 'react'
import { formatSyncStatus, getSyncStatus, subscribeSyncStatus, type SyncStatus } from '../services/sync-status'
import { theme } from '../theme'

export type ViewMode = 'list' | 'form' | 'detail' | 'confirm'

interface StatusBarProps {
  mode: ViewMode
  message?: string
  messageType?: 'success' | 'error' | 'info'
}

const keybindsForMode: Record<ViewMode, string[]> = {
  list: ['j/k:move', 'gg/G:top/bottom', 'o:new', 'e:edit', 'dd:delete', '/:filter', '?:help', 'q:quit'],
  form: ['Tab:next', 'S-Tab:prev', 'C-s:save', 'Esc:cancel'],
  detail: ['e:edit', 'dd:delete', 'h:back'],
  confirm: ['y:yes', 'n:no'],
}

/**
 * Hook to subscribe to sync status changes.
 * Updates every 10 seconds to keep relative time fresh.
 */
function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus)

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus(setStatus)
    return unsubscribe
  }, [])

  // Update periodically to keep relative time display fresh
  useEffect(() => {
    if (status._tag !== 'synced') return

    const interval = setInterval(() => {
      // Force re-render by setting same status
      setStatus({ ...status })
    }, 10_000)

    return () => clearInterval(interval)
  }, [status])

  return status
}

/**
 * Get the color for a sync status.
 */
function getSyncStatusColor(status: SyncStatus): string {
  switch (status._tag) {
    case 'idle':
      return theme.textSubtle
    case 'syncing':
      return theme.info
    case 'synced':
      return theme.success
    case 'offline':
      return theme.warning
    case 'error':
      return theme.error
  }
}

export function StatusBar({ mode, message, messageType }: StatusBarProps) {
  const keybinds = keybindsForMode[mode]
  const syncStatus = useSyncStatus()

  const messageColor = messageType === 'success' ? theme.success : messageType === 'error' ? theme.error : theme.info
  const syncStatusText = formatSyncStatus(syncStatus)
  const syncStatusColor = getSyncStatusColor(syncStatus)

  return (
    <box
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderStyle: 'single',
        borderColor: theme.border,
        backgroundColor: theme.bgSecondary,
        paddingLeft: 1,
        paddingRight: 1,
        height: 3,
      }}
    >
      {/* Keybinds */}
      <box style={{ flexDirection: 'row', gap: 2, flexGrow: 1 }}>
        {keybinds.map((kb) => (
          <text key={kb} fg={theme.textSubtle}>
            {kb}
          </text>
        ))}
      </box>

      {/* Sync Status and Message */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        {/* Sync status */}
        {syncStatusText && <text fg={syncStatusColor}>{syncStatusText}</text>}

        {/* Message (temporary notifications) */}
        {message && <text fg={messageColor}>{message}</text>}
      </box>
    </box>
  )
}
