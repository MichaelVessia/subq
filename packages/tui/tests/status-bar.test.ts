/**
 * Tests for Status Bar Sync Status Display
 *
 * Tests verify:
 * - Status shows 'syncing' during sync
 * - Status shows 'synced (X ago)' after success
 * - Status shows 'offline' on network error
 * - Status shows 'error' on failure
 * - Relative time formatting
 * - Subscribe/unsubscribe behavior
 */
import { describe, expect, it, beforeEach } from 'bun:test'
import {
  formatRelativeTime,
  formatSyncStatus,
  getSyncStatus,
  setSyncStatus,
  subscribeSyncStatus,
  SyncStatus,
} from '../src/services/sync-status.js'

describe('SyncStatus', () => {
  beforeEach(() => {
    // Reset to idle before each test
    setSyncStatus(SyncStatus.idle())
  })

  describe('formatSyncStatus', () => {
    it("shows 'syncing' during sync", () => {
      const status = SyncStatus.syncing()
      const formatted = formatSyncStatus(status)
      expect(formatted).toBe('syncing')
    })

    it("shows 'synced (X ago)' after successful sync", () => {
      const now = new Date('2024-01-15T12:00:00Z')
      const lastSync = new Date('2024-01-15T11:55:00Z') // 5 minutes ago

      const status = SyncStatus.synced(lastSync)
      const formatted = formatSyncStatus(status, now)

      expect(formatted).toBe('synced (5m ago)')
    })

    it("shows 'offline' on network error", () => {
      const status = SyncStatus.offline()
      const formatted = formatSyncStatus(status)
      expect(formatted).toBe('offline')
    })

    it("shows 'error' on sync failure", () => {
      const status = SyncStatus.error('Something went wrong')
      const formatted = formatSyncStatus(status)
      expect(formatted).toBe('error')
    })

    it('shows empty string for idle status', () => {
      const status = SyncStatus.idle()
      const formatted = formatSyncStatus(status)
      expect(formatted).toBe('')
    })
  })

  describe('formatRelativeTime', () => {
    const now = new Date('2024-01-15T12:00:00Z')

    it("shows 'just now' for < 5 seconds", () => {
      const date = new Date('2024-01-15T11:59:58Z') // 2 seconds ago
      expect(formatRelativeTime(date, now)).toBe('just now')
    })

    it("shows 'Xs ago' for seconds", () => {
      const date = new Date('2024-01-15T11:59:30Z') // 30 seconds ago
      expect(formatRelativeTime(date, now)).toBe('30s ago')
    })

    it("shows 'Xm ago' for minutes", () => {
      const date = new Date('2024-01-15T11:45:00Z') // 15 minutes ago
      expect(formatRelativeTime(date, now)).toBe('15m ago')
    })

    it("shows 'Xh ago' for hours", () => {
      const date = new Date('2024-01-15T09:00:00Z') // 3 hours ago
      expect(formatRelativeTime(date, now)).toBe('3h ago')
    })

    it("shows 'Xd ago' for days", () => {
      const date = new Date('2024-01-13T12:00:00Z') // 2 days ago
      expect(formatRelativeTime(date, now)).toBe('2d ago')
    })

    it('handles edge case at 60 seconds', () => {
      const date = new Date('2024-01-15T11:59:00Z') // exactly 60 seconds ago
      expect(formatRelativeTime(date, now)).toBe('1m ago')
    })

    it('handles edge case at 60 minutes', () => {
      const date = new Date('2024-01-15T11:00:00Z') // exactly 60 minutes ago
      expect(formatRelativeTime(date, now)).toBe('1h ago')
    })
  })

  describe('state management', () => {
    it('getSyncStatus returns current status', () => {
      setSyncStatus(SyncStatus.syncing())
      expect(getSyncStatus()._tag).toBe('syncing')

      setSyncStatus(SyncStatus.offline())
      expect(getSyncStatus()._tag).toBe('offline')
    })

    it('subscribeSyncStatus notifies on changes', () => {
      const received: SyncStatus[] = []
      const unsubscribe = subscribeSyncStatus((status) => {
        received.push(status)
      })

      // Should have received initial status
      expect(received.length).toBe(1)
      expect(received[0]._tag).toBe('idle')

      // Change status
      setSyncStatus(SyncStatus.syncing())
      expect(received.length).toBe(2)
      expect(received[1]._tag).toBe('syncing')

      // Change again
      const syncTime = new Date()
      setSyncStatus(SyncStatus.synced(syncTime))
      expect(received.length).toBe(3)
      expect(received[2]._tag).toBe('synced')

      unsubscribe()
    })

    it('unsubscribe stops notifications', () => {
      const received: SyncStatus[] = []
      const unsubscribe = subscribeSyncStatus((status) => {
        received.push(status)
      })

      // Initial notification
      expect(received.length).toBe(1)

      // Unsubscribe
      unsubscribe()

      // Should not receive this
      setSyncStatus(SyncStatus.syncing())
      expect(received.length).toBe(1)
    })

    it('multiple subscribers receive updates', () => {
      const received1: SyncStatus[] = []
      const received2: SyncStatus[] = []

      const unsub1 = subscribeSyncStatus((s) => received1.push(s))
      const unsub2 = subscribeSyncStatus((s) => received2.push(s))

      setSyncStatus(SyncStatus.syncing())

      expect(received1.length).toBe(2) // initial + syncing
      expect(received2.length).toBe(2)
      expect(received1[1]._tag).toBe('syncing')
      expect(received2[1]._tag).toBe('syncing')

      unsub1()
      unsub2()
    })
  })

  describe('SyncStatus constructors', () => {
    it('creates idle status', () => {
      const status = SyncStatus.idle()
      expect(status._tag).toBe('idle')
    })

    it('creates syncing status', () => {
      const status = SyncStatus.syncing()
      expect(status._tag).toBe('syncing')
    })

    it('creates synced status with date', () => {
      const date = new Date('2024-01-15T12:00:00Z')
      const status = SyncStatus.synced(date)
      expect(status._tag).toBe('synced')
      if (status._tag === 'synced') {
        expect(status.lastSync).toBe(date)
      }
    })

    it('creates offline status', () => {
      const status = SyncStatus.offline()
      expect(status._tag).toBe('offline')
    })

    it('creates error status with message', () => {
      const status = SyncStatus.error('Test error')
      expect(status._tag).toBe('error')
      if (status._tag === 'error') {
        expect(status.message).toBe('Test error')
      }
    })
  })
})
