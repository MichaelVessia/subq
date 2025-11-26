import { Schema } from 'effect'

export class BetterAuthApiError extends Schema.TaggedError<BetterAuthApiError>()('BetterAuthApiError', {
  cause: Schema.Defect,
}) {}
