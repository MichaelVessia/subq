// Detail modal for showing full item details

import { useKeyboard } from '@opentui/react'
import { theme } from '../theme'

interface DetailField {
  label: string
  value: string
}

interface DetailModalProps {
  title: string
  fields: DetailField[]
  onClose: () => void
}

export function DetailModal({ title, fields, onClose }: DetailModalProps) {
  useKeyboard((key) => {
    if (key.name === 'escape' || key.name === 'return' || key.name === 'q') {
      onClose()
    }
  })

  // Find max label length for alignment
  const maxLabelLen = Math.max(...fields.map((f) => f.label.length))

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
          width: 70,
          maxHeight: 30,
          padding: 2,
          borderStyle: 'single',
          borderColor: theme.accent,
          flexDirection: 'column',
          gap: 1,
        }}
        backgroundColor={theme.bgSurface}
      >
        {/* Title */}
        <text fg={theme.accent}>
          <strong>{title}</strong>
        </text>

        {/* Separator */}
        <text fg={theme.border}>{'─'.repeat(66)}</text>

        {/* Fields */}
        <scrollbox style={{ flexDirection: 'column', flexGrow: 1 }}>
          {fields.map((field, idx) => (
            <box key={idx} style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={theme.textMuted}>{field.label.padEnd(maxLabelLen + 2)}</text>
              <text fg={theme.text}>{field.value || '-'}</text>
            </box>
          ))}
        </scrollbox>

        {/* Close hint */}
        <box style={{ marginTop: 1 }}>
          <text fg={theme.textSubtle}>[Enter/Esc] Close</text>
        </box>
      </box>
    </box>
  )
}
