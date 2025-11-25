import { WeightLogList } from './components/weight/WeightLogList.js'
import { InjectionLogList } from './components/injection/InjectionLogList.js'
import { Dashboard } from './components/dashboard/Dashboard.js'

type Page = 'weight' | 'injection' | 'dashboard'

function getPage(): Page {
  const path = window.location.pathname
  if (path === '/injection') return 'injection'
  if (path === '/weight') return 'weight'
  if (path === '/dashboard') return 'dashboard'
  return 'dashboard' // default to dashboard
}

export function App() {
  const page = getPage()

  const linkStyle = (active: boolean) => ({
    padding: '0.5rem 1rem',
    textDecoration: 'none',
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    color: active ? '#2563eb' : '#666',
  })

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem', fontFamily: 'system-ui' }}>
      <h1 style={{ marginBottom: '1rem' }}>Health Tracker</h1>

      <nav
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          borderBottom: '1px solid #ccc',
        }}
      >
        <a href="/dashboard" style={linkStyle(page === 'dashboard')}>
          Dashboard
        </a>
        <a href="/weight" style={linkStyle(page === 'weight')}>
          Weight
        </a>
        <a href="/injection" style={linkStyle(page === 'injection')}>
          Injections
        </a>
      </nav>

      {page === 'dashboard' && <Dashboard />}
      {page === 'weight' && <WeightLogList />}
      {page === 'injection' && <InjectionLogList />}
    </div>
  )
}
