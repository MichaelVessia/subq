// Header component with app title and tab navigation

import { theme } from '../theme'

export type Tab = 'injections' | 'inventory' | 'weight'

interface HeaderProps {
  activeTab: Tab
  email?: string
}

export function Header({ activeTab, email }: HeaderProps) {
  const tabs: { key: Tab; label: string; color: string; shortcut: string }[] = [
    { key: 'injections', label: 'Injections', color: theme.tab1, shortcut: '1' },
    { key: 'inventory', label: 'Inventory', color: theme.tab2, shortcut: '2' },
    { key: 'weight', label: 'Weight', color: theme.tab3, shortcut: '3' },
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
                [{tab.shortcut}] {tab.label}
              </text>
            </box>
          )
        })}
      </box>

      {/* User info */}
      <box style={{ alignItems: 'center' }}>
        {email ? <text fg={theme.textSubtle}>{email}</text> : <text fg={theme.textSubtle}>Not logged in</text>}
      </box>
    </box>
  )
}
