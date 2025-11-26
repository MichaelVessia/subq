import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { signOut, useSession } from '../../auth.js'
import { LoginForm } from './LoginForm.js'

const navLinkStyle = (active: boolean): React.CSSProperties => ({
  padding: '0.25rem 0',
  fontSize: 'var(--text-sm)',
  fontWeight: 500,
  color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
  borderBottom: active ? '2px solid var(--color-text)' : '2px solid transparent',
  transition: 'color var(--transition-fast)',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
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
        padding: 'var(--space-4) var(--space-4)',
      }}
      className="app-container"
    >
      <header className="app-header">
        <div className="header-top">
          <h1
            style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            Health Tracker
          </h1>

          <div className="header-user">
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
          </div>
        </div>

        <nav className="app-nav">
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
        </nav>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  )
}
