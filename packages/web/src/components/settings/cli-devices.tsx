import type { CliSession } from '@subq/shared'
import { useState } from 'react'
import { Button } from '../ui/button.js'

interface CliDevicesProps {
  sessions: ReadonlyArray<CliSession>
  onRevoke: (sessionId: string) => void
  onRevokeAll: () => Promise<void>
}

function formatDate(date: Date | null): string {
  if (!date) return 'Never'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function CliDevices({ sessions, onRevoke, onRevokeAll }: CliDevicesProps) {
  const [showRevokeAllConfirm, setShowRevokeAllConfirm] = useState(false)
  const [isRevokingAll, setIsRevokingAll] = useState(false)

  const handleRevokeAll = async () => {
    setIsRevokingAll(true)
    try {
      await onRevokeAll()
    } finally {
      setIsRevokingAll(false)
      setShowRevokeAllConfirm(false)
    }
  }

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No CLI devices connected. Use <code className="bg-muted px-1 py-0.5 rounded">subq login</code> to connect a
        device.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {sessions.map((session) => (
          <div key={session.id} className="flex items-center justify-between py-2 border-b last:border-0">
            <div>
              <p className="font-medium">{session.deviceName ?? 'Unknown device'}</p>
              <p className="text-sm text-muted-foreground">Last used: {formatDate(session.lastUsedAt)}</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => onRevoke(session.id)}>
              Revoke
            </Button>
          </div>
        ))}
      </div>

      {sessions.length > 1 && (
        <div className="pt-2 border-t">
          <Button variant="destructive" onClick={() => setShowRevokeAllConfirm(true)} disabled={isRevokingAll}>
            Revoke All CLI Tokens
          </Button>
        </div>
      )}

      {showRevokeAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 max-w-md mx-4 shadow-lg">
            <h3 className="text-lg font-semibold mb-2">Revoke All CLI Tokens</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will revoke <strong>all {sessions.length} CLI tokens</strong>. Any devices using these tokens will
              need to log in again.
            </p>
            <p className="text-sm text-destructive mb-4">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowRevokeAllConfirm(false)} disabled={isRevokingAll}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRevokeAll} disabled={isRevokingAll}>
                {isRevokingAll ? 'Revoking...' : 'Revoke All Tokens'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
