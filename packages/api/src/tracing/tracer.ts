import * as Otlp from '@effect/opentelemetry/Otlp'
import { FetchHttpClient } from '@effect/platform'
import { Config, Effect, Layer, Option } from 'effect'

/**
 * TracerLayer for production and local development.
 * Reads config from environment variables.
 *
 * For local Jaeger or production Jaeger sidecar:
 *   OTEL_ENDPOINT=http://localhost:4318
 *
 * Set OTEL_SERVICE_NAME to customize service name (default: 'subq-api')
 */
export const TracerLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const serviceName = yield* Config.string('OTEL_SERVICE_NAME').pipe(Config.withDefault('subq-api'))

    // Check for OTEL endpoint (e.g., local Jaeger or Fly.io sidecar)
    const otelEndpoint = yield* Config.option(Config.string('OTEL_ENDPOINT'))

    if (Option.isSome(otelEndpoint)) {
      return Otlp.layer({
        baseUrl: otelEndpoint.value,
        resource: { serviceName },
      })
    }

    // No tracing configured
    return Layer.empty
  }),
).pipe(Layer.provide(FetchHttpClient.layer), Layer.orDie)
