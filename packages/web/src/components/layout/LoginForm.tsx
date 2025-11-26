import { useState } from 'react'
import { signIn, signUp } from '../../auth.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'

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
    <div className="max-w-xs mx-auto mt-16 p-6">
      <h1 className="text-lg font-semibold mb-6">{mode === 'signin' ? 'Sign In' : 'Create Account'}</h1>

      {mode === 'signin' && (
        <div className="mb-6">
          <p className="text-xs text-muted-foreground mb-3">Try a demo account:</p>
          <div className="flex flex-col gap-2">
            {DEMO_USERS.map((user) => (
              <Button
                key={user.email}
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => handleDemoLogin(user.email, user.password)}
                className="justify-start text-xs"
              >
                {user.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === 'signup' && (
          <Input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === 'signup'
              ? 'Creating account...'
              : 'Signing in...'
            : mode === 'signup'
              ? 'Create Account'
              : 'Sign In'}
        </Button>
      </form>

      <p className="mt-4 text-sm text-muted-foreground text-center">
        {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
        <button type="button" onClick={toggleMode} className="text-foreground underline cursor-pointer">
          {mode === 'signin' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}
