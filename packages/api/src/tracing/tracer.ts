import * as OtlpTracer from '@effect/opentelemetry/OtlpTracer'
import * as Otlp from '@effect/opentelemetry/Otlp'
import { FetchHttpClient } from '@effect/platform'
import { Config, Duration, Effect, Layer, ManagedRuntime, Option, type Tracer } from 'effect'

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
 * Worker tracing runtime that supports proper flush on request completion.
 * Use createTracingRuntime() to get a runtime, then dispose() via waitUntil().
 */
export interface WorkerTracingRuntime {
  readonly tracer: Tracer.Tracer
  readonly dispose: () => Promise<void>
}

/**
 * Create a per-request tracing runtime for Cloudflare Workers.
 *
 * Usage:
 * ```ts
 * const tracing = await createTracingRuntime(env)
 * // ... run your traced code with tracing.tracer ...
 * ctx.waitUntil(tracing.dispose()) // Flushes traces before worker terminates
 * ```
 */
export const createTracingRuntime = async (env: AxiomEnv): Promise<WorkerTracingRuntime | null> => {
  if (!env.AXIOM_API_TOKEN || !env.AXIOM_DATASET) {
    return null
  }

  const TracerLive = OtlpTracer.layer({
    url: 'https://api.axiom.co/v1/traces',
    resource: {
      serviceName: env.OTEL_SERVICE_NAME ?? 'subq-api',
    },
    headers: {
      Authorization: `Bearer ${env.AXIOM_API_TOKEN}`,
      'X-Axiom-Dataset': env.AXIOM_DATASET,
    },
    // Export every 100ms or when batch fills
    exportInterval: Duration.millis(100),
    maxBatchSize: 50,
    shutdownTimeout: Duration.seconds(5),
  }).pipe(Layer.provide(FetchHttpClient.layer))

  const runtime = ManagedRuntime.make(TracerLive)
  const tracer = await runtime.runPromise(Effect.tracer)

  return {
    tracer,
    dispose: () => runtime.dispose(),
  }
}

/**
 * Create a TracerLayer for Axiom from Cloudflare Worker env bindings.
 *
 * Requires AXIOM_API_TOKEN and AXIOM_DATASET to be set.
 * If not configured, returns an empty layer (spans created but not exported).
 */
export const makeTracerLayer = (env: AxiomEnv): Layer.Layer<never> => {
  if (!env.AXIOM_API_TOKEN || !env.AXIOM_DATASET) {
    return Layer.empty
  }

  return Otlp.layer({
    baseUrl: 'https://api.axiom.co',
    resource: {
      serviceName: env.OTEL_SERVICE_NAME ?? 'subq-api',
    },
    headers: {
      Authorization: `Bearer ${env.AXIOM_API_TOKEN}`,
      'X-Axiom-Dataset': env.AXIOM_DATASET,
    },
    // Short interval for Workers - export quickly before termination
    tracerExportInterval: Duration.millis(100),
    maxBatchSize: 50,
    shutdownTimeout: Duration.seconds(5),
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
