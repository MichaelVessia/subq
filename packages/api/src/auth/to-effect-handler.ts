import * as BunHttpServerRequest from '@effect/platform-bun/BunHttpServerRequest'
import * as Headers from '@effect/platform/Headers'
import * as HttpServerRequest from '@effect/platform/HttpServerRequest'
import * as HttpServerResponse from '@effect/platform/HttpServerResponse'
import type { Auth } from 'better-auth'
import * as Effect from 'effect/Effect'
import { BetterAuthApiError } from './better-auth-error.js'

export const toEffectHandler: (
  auth:
    | {
        handler: Auth['handler']
      }
    | Auth['handler'],
) => Effect.Effect<HttpServerResponse.HttpServerResponse, BetterAuthApiError, HttpServerRequest.HttpServerRequest> = (
  auth,
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const fetchRequest = BunHttpServerRequest.toRequest(request)

    const handler = 'handler' in auth ? auth.handler : auth
    const response = yield* Effect.tryPromise({
      try: () => handler(fetchRequest),
      catch: (cause) => new BetterAuthApiError({ cause }),
    })

    // Convert Web Response headers to plain object
    // Set-Cookie headers MUST be passed as array - they cannot be combined per HTTP spec
    const headers: Record<string, string | ReadonlyArray<string>> = {}
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') {
        headers[key] = value
      }
    })
    const setCookies = response.headers.getSetCookie()
    if (setCookies.length > 0) {
      headers['set-cookie'] = setCookies
    }

    // Read response body as Uint8Array
    const body = yield* Effect.tryPromise({
      try: () => response.arrayBuffer().then((buf) => new Uint8Array(buf)),
      catch: (cause) => new BetterAuthApiError({ cause }),
    })

    return HttpServerResponse.uint8Array(body, {
      status: response.status,
      headers: Headers.fromInput(headers),
    })
  })
