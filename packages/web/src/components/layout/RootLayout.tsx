import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { signOut, useSession } from '../../auth.js'
import { LoginForm } from './LoginForm.js'

const navLinkStyle = (active: boolean): React.CSSProperties => ({
  padding: '0.5rem 0',
  fontSize: 'var(--text-sm)',
  fontWeight: 500,
  color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
  borderBottom: active ? '2px solid var(--color-text)' : '2px solid transparent',
  transition: 'color var(--transition-fast)',
  textDecoration: 'none',
})

export function RootLayout() {
  const { data: session, isPending } = useSession()
  const location = useLocation()
  const pathname = location.pathname

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
          <Link to="/dashboard" style={navLinkStyle(pathname === '/dashboard')}>
            Dashboard
          </Link>
          <Link to="/stats" style={navLinkStyle(pathname === '/stats')}>
            Stats
          </Link>
          <Link to="/weight" style={navLinkStyle(pathname === '/weight')}>
            Weight
          </Link>
          <Link to="/injection" style={navLinkStyle(pathname === '/injection')}>
            Injections
          </Link>
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
        <Outlet />
      </main>
    </div>
  )
}
