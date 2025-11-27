import type { Auth } from 'better-auth'

/**
 * Convert better-auth handler to a plain fetch handler for Cloudflare Workers.
 * better-auth's handler is already a fetch handler: (Request) => Promise<Response>
 */
export const toWebHandler = (
  auth:
    | {
        handler: Auth['handler']
      }
    | Auth['handler'],
): ((request: Request) => Promise<Response>) => {
  const handler = 'handler' in auth ? auth.handler : auth
  return handler
}
