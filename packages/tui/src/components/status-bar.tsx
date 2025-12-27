// Status bar component showing contextual keybinds

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

export function StatusBar({ mode, message, messageType }: StatusBarProps) {
  const keybinds = keybindsForMode[mode]

  const messageColor = messageType === 'success' ? theme.success : messageType === 'error' ? theme.error : theme.info

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

      {/* Message */}
      {message && (
        <box style={{ paddingLeft: 2 }}>
          <text fg={messageColor}>{message}</text>
        </box>
      )}
    </box>
  )
}
