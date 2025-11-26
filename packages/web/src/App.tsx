import { useState } from 'react'
import { signIn, signOut, useSession } from './auth.js'
import { Dashboard } from './components/dashboard/Dashboard.js'
import { InjectionLogList } from './components/injection/InjectionLogList.js'
import { StatsPage } from './components/stats/StatsPage.js'
import { WeightLogList } from './components/weight/WeightLogList.js'

type Page = 'weight' | 'injection' | 'dashboard' | 'stats'

function getPage(): Page {
  const path = window.location.pathname
  if (path === '/injection') return 'injection'
  if (path === '/weight') return 'weight'
  if (path === '/dashboard') return 'dashboard'
  if (path === '/stats') return 'stats'
  return 'dashboard'
}

const TEST_USERS = [
  { email: 'test@example.com', password: 'testpassword123', label: 'Test User (consistent data)' },
  { email: 'sparse@example.com', password: 'testpassword123', label: 'Sparse User (irregular data)' },
]

function LoginForm() {
  const [email, setEmail] = useState('test@example.com')
  const [password, setPassword] = useState('testpassword123')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await signIn.email({ email, password })
      if (result.error) {
        setError(result.error.message ?? 'Login failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickLogin = async (testEmail: string, testPassword: string) => {
    setError(null)
    setLoading(true)
    try {
      const result = await signIn.email({ email: testEmail, password: testPassword })
      if (result.error) {
        setError(result.error.message ?? 'Login failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '320px', margin: '4rem auto', padding: 'var(--space-6)' }}>
      <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-6)' }}>Sign In</h1>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
          Quick login:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {TEST_USERS.map((user) => (
            <button
              key={user.email}
              type="button"
              disabled={loading}
              onClick={() => handleQuickLogin(user.email, user.password)}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text)',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                cursor: loading ? 'wait' : 'pointer',
                textAlign: 'left',
              }}
            >
              {user.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            padding: 'var(--space-3)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-sm)',
          }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            padding: 'var(--space-3)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-sm)',
          }}
        />
        {error && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 'var(--space-3)',
            background: 'var(--color-text)',
            color: 'var(--color-bg)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  )
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
  const { data: session, isPending } = useSession()

  if (isPending) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
      </div>
    )
  }

  if (!session) {
    return <LoginForm />
  }

  return (
    <div
      style={{
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

        <nav style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center' }}>
          <a href="/dashboard" style={navLinkStyle(page === 'dashboard')}>
            Dashboard
          </a>
          <a href="/stats" style={navLinkStyle(page === 'stats')}>
            Stats
          </a>
          <a href="/weight" style={navLinkStyle(page === 'weight')}>
            Weight
          </a>
          <a href="/injection" style={navLinkStyle(page === 'injection')}>
            Injections
          </a>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{session.user.email}</span>
          <button
            type="button"
            onClick={() => {
              signOut().then(() => {
                window.location.href = '/dashboard'
              })
            }}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text)',
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </nav>
      </header>

      <main>
        {page === 'dashboard' && <Dashboard userId={session.user.id} />}
        {page === 'stats' && <StatsPage userId={session.user.id} />}
        {page === 'weight' && <WeightLogList userId={session.user.id} />}
        {page === 'injection' && <InjectionLogList userId={session.user.id} />}
      </main>
    </div>
  )
}
