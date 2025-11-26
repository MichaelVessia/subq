import { useState } from 'react'
import { signIn, signUp } from '../../auth.js'

const DEMO_USERS = [
  { email: 'consistent@example.com', password: 'testpassword123', label: 'Demo: Consistent data' },
  { email: 'sparse@example.com', password: 'testpassword123', label: 'Demo: Irregular data' },
]

export function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'signup') {
        const result = await signUp.email({ email, password, name })
        if (result.error) {
          setError(result.error.message ?? 'Sign up failed')
        }
      } else {
        const result = await signIn.email({ email, password })
        if (result.error) {
          setError(result.error.message ?? 'Sign in failed')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'signup' ? 'Sign up failed' : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async (demoEmail: string, demoPassword: string) => {
    setError(null)
    setLoading(true)
    try {
      const result = await signIn.email({ email: demoEmail, password: demoPassword })
      if (result.error) {
        setError(result.error.message ?? 'Login failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin')
    setError(null)
  }

  return (
    <div style={{ maxWidth: '320px', margin: '4rem auto', padding: 'var(--space-6)' }}>
      <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-6)' }}>
        {mode === 'signin' ? 'Sign In' : 'Create Account'}
      </h1>

      {mode === 'signin' && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
            Try a demo account:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {DEMO_USERS.map((user) => (
              <button
                key={user.email}
                type="button"
                disabled={loading}
                onClick={() => handleDemoLogin(user.email, user.password)}
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
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {mode === 'signup' && (
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              padding: 'var(--space-3)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-sm)',
            }}
          />
        )}
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
          {loading
            ? mode === 'signup'
              ? 'Creating account...'
              : 'Signing in...'
            : mode === 'signup'
              ? 'Create Account'
              : 'Sign In'}
        </button>
      </form>

      <p
        style={{
          marginTop: 'var(--space-4)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
          textAlign: 'center',
        }}
      >
        {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
        <button
          type="button"
          onClick={toggleMode}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text)',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
            padding: 0,
          }}
        >
          {mode === 'signin' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}
