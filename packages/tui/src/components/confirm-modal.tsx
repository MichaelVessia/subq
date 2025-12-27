// Confirm modal component for delete confirmations

import { useKeyboard } from '@opentui/react'
import { theme } from '../theme'

interface ConfirmModalProps {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
  useKeyboard((key) => {
    if (key.name === 'y' || key.name === 'return') {
      onConfirm()
    } else if (key.name === 'n' || key.name === 'escape' || key.name === 'q') {
      onCancel()
    }
  })

  return (
    <box
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      backgroundColor={theme.bgTertiary}
    >
      <box
        style={{
          width: 50,
          padding: 2,
          borderStyle: 'double',
          borderColor: theme.warning,
          flexDirection: 'column',
          gap: 1,
        }}
        backgroundColor={theme.bgSurface}
      >
        {/* Title */}
        <text fg={theme.warning}>
          <strong>{title}</strong>
        </text>

        {/* Message */}
        <text fg={theme.text}>{message}</text>

        {/* Actions */}
        <box style={{ flexDirection: 'row', gap: 4, marginTop: 1 }}>
          <text fg={theme.success}>[y] Yes</text>
          <text fg={theme.error}>[n] No</text>
        </box>
      </box>
    </box>
  )
}
