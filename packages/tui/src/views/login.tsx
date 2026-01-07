// Login view with email/password inputs

import { useKeyboard, useRenderer } from '@opentui/react'
import { useEffect, useState } from 'react'
import { getConfig } from '../services/config'
import { saveSession, type StoredSession } from '../services/session'
import { theme } from '../theme'

interface LoginViewProps {
  onLogin: (session: StoredSession) => void
}

// Demo user credentials (from seed.ts)
const DEMO_USER = { email: 'consistent@example.com', password: 'testpassword123' }

type Field = 'email' | 'password'

export function LoginView({ onLogin }: LoginViewProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [focusedField, setFocusedField] = useState<Field>('email')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (loginEmail: string, loginPassword: string) => {
    setLoading(true)
    setError(null)

    try {
      const config = getConfig()
      const response = await fetch(`${config.apiUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Login failed' }))
        setError((body as { message?: string }).message || response.statusText)
        setLoading(false)
        return
      }

      // Extract cookies from set-cookie headers
      const cookies = response.headers.getSetCookie()
      const rawSetCookie = response.headers.get('set-cookie')

      if ((!cookies || cookies.length === 0) && !rawSetCookie) {
        setError('No session cookie received')
        setLoading(false)
        return
      }

      const allCookies = cookies?.length ? cookies.join('; ') : (rawSetCookie ?? '')
      const tokenMatch = allCookies.match(/(?:__Secure-)?better-auth\.session_token=([^;,]+)/)
      const dataMatch = allCookies.match(/(?:__Secure-)?better-auth\.session_data=([^;,]+)/)

      let sessionToken: string
      let sessionData: string | undefined

      if (tokenMatch?.[1]) {
        sessionToken = tokenMatch[1]
        sessionData = dataMatch?.[1]
      } else if (dataMatch?.[1]) {
        try {
          const decoded = JSON.parse(atob(dataMatch[1])) as { session?: { session?: { token?: string } } }
          const token = decoded.session?.session?.token
          if (!token) {
            setError('Could not extract session token')
            setLoading(false)
            return
          }
          sessionToken = token
          sessionData = dataMatch[1]
        } catch {
          setError('Could not parse session_data cookie')
          setLoading(false)
          return
        }
      } else {
        setError('Could not parse session cookies')
        setLoading(false)
        return
      }

      const isSecure = allCookies.includes('__Secure-better-auth.')

      const data = await response.json().catch(() => ({}))
      const user = (data as { user?: { id: string; email: string } }).user

      if (!user) {
        setError('No user data in response')
        setLoading(false)
        return
      }

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const session: StoredSession = {
        sessionToken,
        sessionData: sessionData ?? '',
        userId: user.id,
        email: user.email,
        expiresAt,
        isSecure,
      }

      saveSession(session)
      onLogin(session)
    } catch (err) {
      setError(`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setLoading(false)
    }
  }

  const renderer = useRenderer()

  // Handle paste events (opentui Input doesn't support paste natively)
  useEffect(() => {
    const handlePaste = (event: { text: string }) => {
      if (loading) return
      const setter = focusedField === 'email' ? setEmail : setPassword
      setter((prev) => prev + event.text)
    }
    renderer.keyInput.on('paste', handlePaste)
    return () => {
      renderer.keyInput.off('paste', handlePaste)
    }
  }, [renderer, focusedField, loading])

  useKeyboard((key) => {
    if (loading) return

    if (key.shift && key.name === 'tab') {
      setFocusedField((f) => (f === 'password' ? 'email' : 'password'))
    } else if (key.name === 'tab') {
      setFocusedField((f) => (f === 'email' ? 'password' : 'email'))
    } else if (key.ctrl && key.name === 'd') {
      // Demo login
      handleLogin(DEMO_USER.email, DEMO_USER.password)
    } else if (key.name === 'return') {
      if (email && password) {
        handleLogin(email, password)
      }
    }
  })

  return (
    <box
      style={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      backgroundColor={theme.bg}
    >
      <box
        style={{
          width: 50,
          padding: 2,
          borderStyle: 'double',
          borderColor: theme.accent,
          flexDirection: 'column',
          gap: 1,
        }}
        backgroundColor={theme.bgSurface}
      >
        {/* Title */}
        <box style={{ alignItems: 'center', marginBottom: 1 }}>
          <text fg={theme.accent}>
            <strong>SubQ Login</strong>
          </text>
        </box>

        {/* Email field */}
        <box style={{ flexDirection: 'column' }}>
          <text fg={focusedField === 'email' ? theme.accent : theme.textMuted}>Email:</text>
          <box
            style={{
              borderStyle: 'single',
              borderColor: focusedField === 'email' ? theme.borderFocused : theme.border,
              height: 3,
            }}
          >
            <input placeholder="Enter email..." focused={focusedField === 'email'} value={email} onInput={setEmail} />
          </box>
        </box>

        {/* Password field */}
        <box style={{ flexDirection: 'column' }}>
          <text fg={focusedField === 'password' ? theme.accent : theme.textMuted}>Password:</text>
          <box
            style={{
              borderStyle: 'single',
              borderColor: focusedField === 'password' ? theme.borderFocused : theme.border,
              height: 3,
            }}
          >
            <input
              placeholder="Enter password..."
              focused={focusedField === 'password'}
              value={password}
              onInput={setPassword}
            />
          </box>
        </box>

        {/* Error message */}
        {error && <text fg={theme.error}>{error}</text>}

        {/* Status / Instructions */}
        <box style={{ marginTop: 1 }}>
          {loading ? (
            <text fg={theme.textMuted}>Logging in...</text>
          ) : (
            <box style={{ flexDirection: 'column' }}>
              <text fg={theme.textSubtle}>Press Enter to login</text>
              <text fg={theme.textSubtle}>Press Ctrl+D for demo user</text>
            </box>
          )}
        </box>
      </box>
    </box>
  )
}
