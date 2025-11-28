import * as Otlp from '@effect/opentelemetry/Otlp'
import { FetchHttpClient } from '@effect/platform'
import { Config, Duration, Effect, Layer, Option } from 'effect'

/**
 * Axiom OTEL configuration for Cloudflare Workers.
 */
export interface AxiomEnv {
  /** Axiom API token */
  AXIOM_API_TOKEN?: string
  /** Axiom dataset name */
  AXIOM_DATASET?: string
  /** Service name for traces (default: 'subq-api') */
  OTEL_SERVICE_NAME?: string
}

/**
 * Create a TracerLayer for Axiom from Cloudflare Worker env bindings.
 *
 * Requires AXIOM_API_TOKEN and AXIOM_DATASET to be set.
 * If not configured, returns an empty layer (spans created but not exported).
 */
export const makeTracerLayer = (env: AxiomEnv): Layer.Layer<never> => {
  console.log('[tracer] makeTracerLayer called', {
    hasToken: !!env.AXIOM_API_TOKEN,
    hasDataset: !!env.AXIOM_DATASET,
    serviceName: env.OTEL_SERVICE_NAME,
  })
  if (!env.AXIOM_API_TOKEN || !env.AXIOM_DATASET) {
    // Not configured - return empty layer
    console.log('[tracer] No Axiom config, returning empty layer')
    return Layer.empty
  }
  console.log('[tracer] Axiom config found, creating tracer layer')

  return Otlp.layer({
    baseUrl: 'https://api.axiom.co',
    resource: {
      serviceName: env.OTEL_SERVICE_NAME ?? 'subq-api',
    },
    headers: {
      Authorization: `Bearer ${env.AXIOM_API_TOKEN}`,
      'X-Axiom-Dataset': env.AXIOM_DATASET,
    },
    // Shorter intervals for Workers which have limited execution time
    tracerExportInterval: Duration.seconds(1),
  }).pipe(Layer.provide(FetchHttpClient.layer))
}

/**
 * TracerLayer for local development (Node.js).
 * Reads config from environment variables.
 *
 * For local Jaeger: OTEL_ENDPOINT=http://localhost:4318
 * For Axiom: AXIOM_API_TOKEN and AXIOM_DATASET
 */
export const TracerLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const serviceName = yield* Config.string('OTEL_SERVICE_NAME').pipe(Config.withDefault('subq-api'))

    // Check for Axiom config
    const axiomToken = yield* Config.option(Config.string('AXIOM_API_TOKEN'))
    const axiomDataset = yield* Config.option(Config.string('AXIOM_DATASET'))

    if (Option.isSome(axiomToken) && Option.isSome(axiomDataset)) {
      return Otlp.layer({
        baseUrl: 'https://api.axiom.co',
        resource: { serviceName },
        headers: {
          Authorization: `Bearer ${axiomToken.value}`,
          'X-Axiom-Dataset': axiomDataset.value,
        },
      })
    }

    // Check for generic OTEL endpoint (e.g., local Jaeger)
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
