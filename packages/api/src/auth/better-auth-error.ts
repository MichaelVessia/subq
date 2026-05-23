import { Schema } from 'effect'

export class BetterAuthApiError extends Schema.TaggedClass<BetterAuthApiError>()('BetterAuthApiError', {
  cause: Schema.Defect,
}) {}
