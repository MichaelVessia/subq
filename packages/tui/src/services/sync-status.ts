/**
 * Sync Status State Module
 *
 * Provides reactive sync status for the TUI.
 * Uses a simple pub/sub pattern since TUI doesn't use Effect Atom.
 */

// ============================================
// Types
// ============================================

/** Sync status for UI display */
export type SyncStatus =
  | { readonly _tag: 'idle' }
  | { readonly _tag: 'syncing' }
  | { readonly _tag: 'synced'; readonly lastSync: Date }
  | { readonly _tag: 'offline' }
  | { readonly _tag: 'error'; readonly message: string }

// ============================================
// Constructors
// ============================================

export const SyncStatus = {
  idle: (): SyncStatus => ({ _tag: 'idle' }),
  syncing: (): SyncStatus => ({ _tag: 'syncing' }),
  synced: (lastSync: Date): SyncStatus => ({ _tag: 'synced', lastSync }),
  offline: (): SyncStatus => ({ _tag: 'offline' }),
  error: (message: string): SyncStatus => ({ _tag: 'error', message }),
} as const

// ============================================
// State Management
// ============================================

type Listener = (status: SyncStatus) => void

let currentStatus: SyncStatus = SyncStatus.idle()
const listeners = new Set<Listener>()

/**
 * Get the current sync status.
 */
export const getSyncStatus = (): SyncStatus => currentStatus

/**
 * Set the sync status and notify all listeners.
 */
export const setSyncStatus = (status: SyncStatus): void => {
  currentStatus = status
  for (const listener of listeners) {
    listener(status)
  }
}

/**
 * Subscribe to sync status changes.
 * Returns an unsubscribe function.
 */
export const subscribeSyncStatus = (listener: Listener): (() => void) => {
  listeners.add(listener)
  // Call immediately with current status
  listener(currentStatus)
  return () => {
    listeners.delete(listener)
  }
}

// ============================================
// Formatting
// ============================================

/**
 * Format relative time from a Date.
 * Returns strings like "just now", "1m ago", "5m ago", "1h ago", etc.
 */
export const formatRelativeTime = (date: Date, now: Date = new Date()): string => {
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`

  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay}d ago`
}

/**
 * Format sync status for display in the status bar.
 */
export const formatSyncStatus = (status: SyncStatus, now: Date = new Date()): string => {
  switch (status._tag) {
    case 'idle':
      return ''
    case 'syncing':
      return 'syncing'
    case 'synced':
      return `synced (${formatRelativeTime(status.lastSync, now)})`
    case 'offline':
      return 'offline'
    case 'error':
      return 'error'
  }
}
