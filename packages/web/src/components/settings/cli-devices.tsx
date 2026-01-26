import type { CliSession } from '@subq/shared'
import { Button } from '../ui/button.js'

interface CliDevicesProps {
  sessions: ReadonlyArray<CliSession>
  onRevoke: (sessionId: string) => void
}

function formatDate(date: Date | null): string {
  if (!date) return 'Never'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function CliDevices({ sessions, onRevoke }: CliDevicesProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No CLI devices connected. Use <code className="bg-muted px-1 py-0.5 rounded">subq login</code> to connect a
        device.
      </p>
    )
  }

  return (
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
  )
}
