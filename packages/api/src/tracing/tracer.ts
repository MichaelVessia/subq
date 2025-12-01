import * as Otlp from '@effect/opentelemetry/Otlp'
import { FetchHttpClient } from '@effect/platform'
import { Config, Effect, Layer, Option, Redacted } from 'effect'

/**
 * TracerLayer for production and local development.
 * Reads config from environment variables.
 *
 * For local Jaeger:
 *   OTEL_ENDPOINT=http://localhost:4318
 *
 * For Grafana Cloud:
 *   OTEL_ENDPOINT=https://otlp-gateway-prod-us-east-0.grafana.net/otlp
 *   OTEL_AUTH_HEADER=Basic <base64(instanceId:apiKey)>
 *
 * Set OTEL_SERVICE_NAME to customize service name (default: 'subq-api')
 */
export const TracerLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const serviceName = yield* Config.string('OTEL_SERVICE_NAME').pipe(Config.withDefault('subq-api'))

    // Check for OTEL endpoint (e.g., local Jaeger or Grafana Cloud)
    const otelEndpoint = yield* Config.option(Config.string('OTEL_ENDPOINT'))
    const otelAuthHeader = yield* Config.option(Config.redacted('OTEL_AUTH_HEADER'))

    if (Option.isSome(otelEndpoint)) {
      const headers: Record<string, string> = {}
      if (Option.isSome(otelAuthHeader)) {
        headers.Authorization = Redacted.value(otelAuthHeader.value)
      }

      return Otlp.layer({
        baseUrl: otelEndpoint.value,
        resource: { serviceName },
        headers,
      })
    }

    // No tracing configured
    return Layer.empty
  }),
).pipe(Layer.provide(FetchHttpClient.layer), Layer.orDie)
