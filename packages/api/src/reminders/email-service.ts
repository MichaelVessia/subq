import { Config, Data, Effect, Layer, Redacted, Schedule } from 'effect'
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

const createReminderEmail = (user: UserDueForReminder) => ({
  from: 'SubQ <noreply@notifications.subq.vessia.net>',
  to: user.email,
  subject: "It's shot day! 💉",
  text: `Hi ${user.name},

Time for your ${user.dosage} ${user.drug} injection.

Log it here: https://subq.vessia.net

—SubQ`,
  html: `
    <p>Hi ${user.name},</p>
    <p>Time for your <strong>${user.dosage} ${user.drug}</strong> injection.</p>
    <p><a href="https://subq.vessia.net">Log it here</a></p>
    <p>—SubQ</p>
  `,
})

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

export const EmailServiceLive = Layer.effect(
  EmailService,
  Effect.gen(function* () {
    const apiKey = yield* Config.redacted('RESEND_API_KEY')
    const resend = new Resend(Redacted.value(apiKey))

    // Retry policy: 3 attempts with exponential backoff
    const retryPolicy = Schedule.exponential('100 millis').pipe(Schedule.compose(Schedule.recurs(3)))

    const sendReminderEmail = (user: UserDueForReminder): Effect.Effect<void, EmailServiceError> =>
      Effect.tryPromise({
        try: async () => {
          const email = createReminderEmail(user)
          const result = await resend.emails.send(email)
          if (result.error) {
            throw new Error(result.error.message)
          }
          return result
        },
        catch: (error) => new EmailServiceError({ message: `Failed to send email to ${user.email}`, cause: error }),
      }).pipe(
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

        // Send emails in parallel with concurrency limit
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
  }),
)
