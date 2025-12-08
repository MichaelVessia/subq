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

      // Extract session token from set-cookie header
      const setCookie = response.headers.get('set-cookie')
      if (!setCookie) {
        yield* error('No session cookie received')
        return
      }

      // Parse the session token from the cookie
      const tokenMatch = setCookie.match(/better-auth\.session_token=([^;]+)/)
      if (!tokenMatch || !tokenMatch[1]) {
        yield* error('Could not parse session token')
        return
      }

      const token = tokenMatch[1]

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
          token,
          userId: user.id,
          email: user.email,
          expiresAt,
        }),
      )

      yield* success(`Logged in as ${user.email}`)
    }),
).pipe(Command.withDescription('Log in to your account'))
