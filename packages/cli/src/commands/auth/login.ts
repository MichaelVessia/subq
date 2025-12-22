import { Command, Options, Prompt } from '@effect/cli'
import { Effect, Option, Redacted } from 'effect'
import { error, success } from '../../lib/output.js'
import { CliConfigService } from '../../services/config.js'
import { Session, StoredSession } from '../../services/session.js'

// Demo user credentials (from seed.ts)
const DEMO_USER = { email: 'consistent@example.com', password: 'testpassword123' }

const emailOption = Options.text('email').pipe(
  Options.withAlias('e'),
  Options.optional,
  Options.withDescription('Email address'),
)

const passwordOption = Options.text('password').pipe(
  Options.withAlias('p'),
  Options.optional,
  Options.withDescription('Password'),
)

const demoOption = Options.boolean('demo').pipe(
  Options.withDefault(false),
  Options.withDescription('Login with demo user (consistent@example.com)'),
)

const emailPrompt = Prompt.text({
  message: 'Email:',
})

const passwordPrompt = Prompt.password({
  message: 'Password:',
})

export const loginCommand = Command.make(
  'login',
  { email: emailOption, password: passwordOption, demo: demoOption },
  ({ email: emailOpt, password: passwordOpt, demo }) =>
    Effect.gen(function* () {
      const session = yield* Session
      const config = yield* CliConfigService

      let email: string
      let password: string

      if (demo) {
        // Use demo credentials
        email = DEMO_USER.email
        password = DEMO_USER.password
      } else {
        // Get email - from option or prompt
        if (Option.isSome(emailOpt)) {
          email = emailOpt.value
        } else {
          email = yield* emailPrompt
        }

        // Get password - from option or prompt
        if (Option.isSome(passwordOpt)) {
          password = passwordOpt.value
        } else {
          const redactedPassword = yield* passwordPrompt
          password = Redacted.value(redactedPassword)
        }
      }

      // Call better-auth sign-in endpoint
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`${config.apiUrl}/api/auth/sign-in/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          }),
        catch: (err) => new Error(`Failed to connect to API: ${err}`),
      })

      if (!response.ok) {
        const body = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: () => ({ message: 'Login failed' }),
        })
        yield* error(`Login failed: ${(body as any).message || response.statusText}`)
        return
      }

      // Extract cookies from set-cookie headers
      // Use getSetCookie() to get all Set-Cookie headers (there may be multiple)
      const cookies = response.headers.getSetCookie()

      // Also try the raw header approach as fallback
      const rawSetCookie = response.headers.get('set-cookie')

      if ((!cookies || cookies.length === 0) && !rawSetCookie) {
        yield* error('No session cookie received')
        return
      }

      // Combine all cookies - from getSetCookie array and raw header (may have comma-separated cookies)
      const allCookies = cookies?.length ? cookies.join('; ') : (rawSetCookie ?? '')

      // Parse the session_token cookie (signed cookie from better-auth)
      const tokenMatch = allCookies.match(/(?:__Secure-)?better-auth\.session_token=([^;,]+)/)
      // Parse the session_data cookie (for session caching)
      const dataMatch = allCookies.match(/(?:__Secure-)?better-auth\.session_data=([^;,]+)/)

      // If we have session_data but no session_token, extract token from session_data
      // The session_data contains the full session including the token
      let sessionToken: string
      let sessionData: string | undefined

      if (tokenMatch?.[1]) {
        sessionToken = tokenMatch[1]
        sessionData = dataMatch?.[1]
      } else if (dataMatch?.[1]) {
        // Fallback: extract token from session_data JSON
        try {
          const decoded = JSON.parse(atob(dataMatch[1]))
          sessionToken = decoded.session?.session?.token
          sessionData = dataMatch[1]
          if (!sessionToken) {
            yield* error('Could not extract session token from session_data')
            return
          }
        } catch {
          yield* error('Could not parse session_data cookie')
          return
        }
      } else {
        yield* error('Could not parse session cookies')
        return
      }

      // Check if using secure prefix (HTTPS)
      const isSecure = allCookies.includes('__Secure-better-auth.')

      // Get user info from response
      const data = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () => ({}),
      })

      const user = (data as any).user
      if (!user) {
        yield* error('No user data in response')
        return
      }

      // Calculate expiration (better-auth default is 7 days)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      // Save session
      yield* session.save(
        new StoredSession({
          sessionToken,
          sessionData: sessionData ?? '',
          userId: user.id,
          email: user.email,
          expiresAt,
          isSecure,
        }),
      )

      yield* success(`Logged in as ${user.email}`)
    }),
).pipe(Command.withDescription('Log in to your account'))
