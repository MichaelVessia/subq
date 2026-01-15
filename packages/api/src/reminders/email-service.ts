import { getNextSite } from '@subq/shared'
import { Config, Data, Effect, Layer, Option, Redacted, Schedule } from 'effect'
import { Resend } from 'resend'
import type { UserDueForReminder } from './reminder-service.js'

// ============================================
// Errors
// ============================================

export class EmailServiceError extends Data.TaggedError('EmailServiceError')<{
  message: string
  cause?: unknown
}> {}

// ============================================
// Email Content
// ============================================

const createReminderEmail = (user: UserDueForReminder) => {
  const suggestedSite = getNextSite(user.lastInjectionSite)

  // Build the timing message
  let timingMessage: string
  if (user.daysSinceLastInjection === null) {
    timingMessage = "It's time for your first injection!"
  } else if (user.isOverdue) {
    timingMessage = `It's been ${user.daysSinceLastInjection} days since your last injection (${user.daysOverdue} day${user.daysOverdue === 1 ? '' : 's'} overdue).`
  } else {
    timingMessage = `It's been ${user.daysSinceLastInjection} days since your last injection.`
  }

  // Subject varies based on overdue status
  const subject = user.isOverdue ? 'Reminder: Injection overdue 💉' : "It's shot day! 💉"

  return {
    from: 'SubQ <noreply@notifications.subq.vessia.net>',
    to: user.email,
    subject,
    text: `Hi ${user.name},

${timingMessage}

Your ${user.daysSinceLastInjection === null ? '' : 'next '}dose: ${user.dosage} ${user.drug}
Suggested site: ${suggestedSite}

Log it here: https://subq.vessia.net

—SubQ

Manage notifications: https://subq.vessia.net/settings`,
    html: `
    <p>Hi ${user.name},</p>
    <p>${timingMessage}</p>
    <p>Your ${user.daysSinceLastInjection === null ? '' : 'next '}dose: <strong>${user.dosage} ${user.drug}</strong><br/>
    Suggested site: <strong>${suggestedSite}</strong></p>
    <p><a href="https://subq.vessia.net">Log it here</a></p>
    <p>—SubQ</p>
    <p style="font-size: 12px; color: #666;"><a href="https://subq.vessia.net/settings">Manage notifications</a></p>
  `,
  }
}

// ============================================
// Service Definition
// ============================================

export class EmailService extends Effect.Tag('EmailService')<
  EmailService,
  {
    readonly sendReminderEmail: (user: UserDueForReminder) => Effect.Effect<void, EmailServiceError>
    readonly sendReminderEmails: (
      users: UserDueForReminder[],
    ) => Effect.Effect<{ sent: number; failed: number; errors: string[] }>
  }
>() {}

// ============================================
// Service Implementation
// ============================================

// No-op implementation when RESEND_API_KEY is not configured
const noOpEmailService: EmailService['Type'] = {
  sendReminderEmail: (user) =>
    Effect.logWarning('Email disabled - RESEND_API_KEY not configured').pipe(
      Effect.annotateLogs({ email: user.email }),
    ),
  sendReminderEmails: (users) =>
    Effect.logWarning('Email disabled - RESEND_API_KEY not configured').pipe(
      Effect.annotateLogs({ userCount: users.length }),
      Effect.map(() => ({ sent: 0, failed: users.length, errors: ['RESEND_API_KEY not configured'] })),
    ),
}

// Real implementation with Resend
const createRealEmailService = (apiKey: string): EmailService['Type'] => {
  const resend = new Resend(apiKey)
  const retryPolicy = Schedule.exponential('100 millis').pipe(Schedule.compose(Schedule.recurs(3)))

  const sendReminderEmail = (user: UserDueForReminder): Effect.Effect<void, EmailServiceError> =>
    Effect.tryPromise({
      try: async () => {
        const email = createReminderEmail(user)
        return resend.emails.send(email)
      },
      catch: (error) => new EmailServiceError({ message: `Failed to send email to ${user.email}`, cause: error }),
    }).pipe(
      Effect.flatMap((result) =>
        result.error ? Effect.die(new Error(`Resend API error: ${result.error.message}`)) : Effect.succeed(result),
      ),
      Effect.retry(retryPolicy),
      Effect.tap(() =>
        Effect.logInfo('Reminder email sent').pipe(Effect.annotateLogs({ email: user.email, drug: user.drug })),
      ),
      Effect.asVoid,
    )

  const sendReminderEmails = (users: UserDueForReminder[]) =>
    Effect.gen(function* () {
      let sent = 0
      let failed = 0
      const errors: string[] = []

      const results = yield* Effect.all(
        users.map((user) =>
          sendReminderEmail(user).pipe(
            Effect.map(() => ({ success: true as const, email: user.email })),
            Effect.catchAll((error) =>
              Effect.succeed({ success: false as const, email: user.email, error: error.message }),
            ),
          ),
        ),
        { concurrency: 5 },
      )

      for (const result of results) {
        if (result.success) {
          sent++
        } else {
          failed++
          errors.push(`${result.email}: ${result.error}`)
        }
      }

      yield* Effect.logInfo('Reminder emails batch completed').pipe(
        Effect.annotateLogs({ sent, failed, total: users.length }),
      )

      return { sent, failed, errors }
    })

  return { sendReminderEmail, sendReminderEmails }
}

export const EmailServiceLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const apiKeyOption = yield* Config.option(Config.redacted('RESEND_API_KEY'))

    if (Option.isNone(apiKeyOption)) {
      yield* Effect.logWarning('RESEND_API_KEY not configured - email sending disabled')
      return Layer.succeed(EmailService, noOpEmailService)
    }

    yield* Effect.logInfo('Email service initialized with Resend')
    return Layer.succeed(EmailService, createRealEmailService(Redacted.value(apiKeyOption.value)))
  }),
)
