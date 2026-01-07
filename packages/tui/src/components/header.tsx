// Header component with app title and tab navigation

import { useTerminalDimensions } from '@opentui/react'
import { theme } from '../theme'

// Width threshold below which we hide tab labels (show only shortcuts)
const COMPACT_HEADER_THRESHOLD = 80

export type Tab = 'stats' | 'weight' | 'injections' | 'inventory' | 'schedule'

interface HeaderProps {
  activeTab: Tab
  email?: string
}

export function Header({ activeTab, email }: HeaderProps) {
  const { width: termWidth } = useTerminalDimensions()
  const compact = termWidth < COMPACT_HEADER_THRESHOLD

  const tabs: { key: Tab; label: string; color: string; shortcut: string }[] = [
    { key: 'stats', label: 'Stats', color: theme.tab4, shortcut: '1' },
    { key: 'weight', label: 'Weight', color: theme.tab3, shortcut: '2' },
    { key: 'injections', label: 'Injections', color: theme.tab1, shortcut: '3' },
    { key: 'inventory', label: 'Inventory', color: theme.tab2, shortcut: '4' },
    { key: 'schedule', label: 'Schedule', color: theme.accent, shortcut: '5' },
  ]

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
      {/* Logo/Title */}
      <box style={{ flexDirection: 'row', alignItems: 'center' }}>
        <text fg={theme.accent}>
          <strong>SubQ</strong>
        </text>
      </box>

      {/* Tabs */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <box
              key={tab.key}
              style={{
                paddingLeft: 1,
                paddingRight: 1,
              }}
              backgroundColor={isActive ? theme.bgSurface : theme.bgSecondary}
            >
              <text fg={isActive ? tab.color : theme.textMuted}>
                [{tab.shortcut}]{compact ? '' : ` ${tab.label}`}
              </text>
            </box>
          )
        })}
      </box>

      {/* User info (hidden on narrow screens) */}
      {!compact && (
        <box style={{ alignItems: 'center' }}>
          {email ? <text fg={theme.textSubtle}>{email}</text> : <text fg={theme.textSubtle}>Not logged in</text>}
        </box>
      )}
    </box>
  )
}
