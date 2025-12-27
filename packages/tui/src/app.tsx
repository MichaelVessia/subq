// Main app component with routing and state management

import { useKeyboard } from '@opentui/react'
import { useEffect, useState } from 'react'
import { Header, type Tab } from './components/header'
import { StatusBar, type ViewMode } from './components/status-bar'
import { clearSession, getSession, type StoredSession } from './services/session'
import { theme } from './theme'
import { InjectionsView } from './views/injections'
import { InventoryView } from './views/inventory'
import { LoginView } from './views/login'
import { ScheduleView } from './views/schedule'
import { StatsView } from './views/stats'
import { WeightView } from './views/weight'

type AppState = { view: 'login' } | { view: 'dashboard'; tab: Tab; session: StoredSession }

export function App() {
  const [state, setState] = useState<AppState>({ view: 'login' })
  const [viewMode] = useState<ViewMode>('list')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)

  // Check for existing session on mount
  useEffect(() => {
    const session = getSession()
    if (session) {
      setState({ view: 'dashboard', tab: 'stats', session })
    }
  }, [])

  // Clear message after 3 seconds
  useEffect(() => {
    if (message) {
      const timeout = setTimeout(() => setMessage(null), 3000)
      return () => clearTimeout(timeout)
    }
  }, [message])

  // Global keyboard shortcuts
  useKeyboard((key) => {
    if (state.view !== 'dashboard') return

    // Tab switching
    if (key.name === '1') {
      setState((s) => (s.view === 'dashboard' ? { ...s, tab: 'stats' } : s))
    } else if (key.name === '2') {
      setState((s) => (s.view === 'dashboard' ? { ...s, tab: 'weight' } : s))
    } else if (key.name === '3') {
      setState((s) => (s.view === 'dashboard' ? { ...s, tab: 'injections' } : s))
    } else if (key.name === '4') {
      setState((s) => (s.view === 'dashboard' ? { ...s, tab: 'inventory' } : s))
    } else if (key.name === '5') {
      setState((s) => (s.view === 'dashboard' ? { ...s, tab: 'schedule' } : s))
    } else if (key.shift && key.name === 'h') {
      // Previous tab
      setState((s) => {
        if (s.view !== 'dashboard') return s
        const tabs: Tab[] = ['stats', 'weight', 'injections', 'inventory', 'schedule']
        const idx = tabs.indexOf(s.tab)
        return { ...s, tab: tabs[(idx - 1 + tabs.length) % tabs.length] as Tab }
      })
    } else if (key.shift && key.name === 'l') {
      // Next tab
      setState((s) => {
        if (s.view !== 'dashboard') return s
        const tabs: Tab[] = ['stats', 'weight', 'injections', 'inventory', 'schedule']
        const idx = tabs.indexOf(s.tab)
        return { ...s, tab: tabs[(idx + 1) % tabs.length] as Tab }
      })
    } else if (key.name === 'q' && !key.ctrl) {
      // Logout
      clearSession()
      setState({ view: 'login' })
    }
  })

  const handleLogin = (session: StoredSession) => {
    setState({ view: 'dashboard', tab: 'stats', session })
    setMessage({ text: `Logged in as ${session.email}`, type: 'success' })
  }

  if (state.view === 'login') {
    return <LoginView onLogin={handleLogin} />
  }

  return (
    <box
      style={{
        flexDirection: 'column',
        flexGrow: 1,
      }}
      backgroundColor={theme.bg}
    >
      {/* Header */}
      <Header activeTab={state.tab} email={state.session.email} />

      {/* Main content area */}
      <box style={{ flexGrow: 1, padding: 1 }}>
        {state.tab === 'stats' && <StatsView onMessage={(text, type) => setMessage({ text, type })} />}
        {state.tab === 'weight' && <WeightView onMessage={(text, type) => setMessage({ text, type })} />}
        {state.tab === 'injections' && <InjectionsView onMessage={(text, type) => setMessage({ text, type })} />}
        {state.tab === 'inventory' && <InventoryView onMessage={(text, type) => setMessage({ text, type })} />}
        {state.tab === 'schedule' && <ScheduleView onMessage={(text, type) => setMessage({ text, type })} />}
      </box>

      {/* Status bar */}
      <StatusBar mode={viewMode} {...(message ? { message: message.text, messageType: message.type } : {})} />
    </box>
  )
}
