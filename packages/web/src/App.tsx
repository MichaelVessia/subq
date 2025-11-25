import { WeightLogList } from './components/weight/WeightLogList.js'
import { InjectionLogList } from './components/injection/InjectionLogList.js'
import { Dashboard } from './components/dashboard/Dashboard.js'

type Page = 'weight' | 'injection' | 'dashboard'

function getPage(): Page {
  const path = window.location.pathname
  if (path === '/injection') return 'injection'
  if (path === '/weight') return 'weight'
  if (path === '/dashboard') return 'dashboard'
  return 'dashboard'
}

const navLinkStyle = (active: boolean): React.CSSProperties => ({
  padding: '0.5rem 0',
  fontSize: 'var(--text-sm)',
  fontWeight: 500,
  color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
  borderBottom: active ? '2px solid var(--color-text)' : '2px solid transparent',
  transition: 'color var(--transition-fast)',
})

export function App() {
  const page = getPage()

  return (
    <div
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: 'var(--space-6) var(--space-5)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-8)',
          paddingBottom: 'var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          Health Tracker
        </h1>

        <nav style={{ display: 'flex', gap: 'var(--space-6)' }}>
          <a href="/dashboard" style={navLinkStyle(page === 'dashboard')}>
            Dashboard
          </a>
          <a href="/weight" style={navLinkStyle(page === 'weight')}>
            Weight
          </a>
          <a href="/injection" style={navLinkStyle(page === 'injection')}>
            Injections
          </a>
        </nav>
      </header>

      <main>
        {page === 'dashboard' && <Dashboard />}
        {page === 'weight' && <WeightLogList />}
        {page === 'injection' && <InjectionLogList />}
      </main>
    </div>
  )
}
